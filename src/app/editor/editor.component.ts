import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { Http } from '@angular/http';
import { AuthService } from "../auth/auth.service";
import { SqlBPMNModdle } from "./bpmn-sql-extension";
import { Analyser } from "../analyser/SQLDFlowAnalizer";
import { topologicalSorting, dataFlowAnalysis } from "../analyser/GraMSecAnalizer";
import { SidebarComponent } from '../sidebar/sidebar.component';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';

declare var $: any;
declare var CodeMirror: any;
declare function require(name: string);

let is = (element, type) => element.$instanceOf(type);

var pg_parser = require("exports-loader?Module!pgparser/pg_query.js");
pg_parser.parse("");

var config = require('./../../config.json');

@Component({
  selector: 'app-sql-privacy-editor',
  templateUrl: '/editor.component.html',
  styleUrls: ['/editor.component.less']
})
export class EditorComponent implements OnInit {

  constructor(public http: Http, private authService: AuthService) {
    let pathname = window.location.pathname.split('/');
    if (pathname[2] === 'viewer') {
      this.modelId = pathname[3];
      this.viewerType = 'public';
    } else {
      this.modelId = pathname[2];
      this.viewerType = 'private';
    }
    this.authService.authStatus.subscribe(status => {
      this.authenticated = status;
      if (typeof(status) === 'boolean') {
        this.getModel();
      }
    });
    this.getModel();
  }

  @Input() authenticated: Boolean;
  @ViewChild(SidebarComponent) sidebarComponent: SidebarComponent;

  private loaded: boolean = false;

  private viewer: NavigatedViewer;
  private eventBus;
  private overlays;
  private canvas;

  private modelId;
  private viewerType;

  private lastContent: String = '';
  private codeMirror: any;
  private fileId: Number = null;
  private file: any;
  private lastModified: Number = null;
  private selectedDataObjects: Array<string> = [];

  private elementBeingEdited: String = null;
  private elementOldValue: String = "";

  isAuthenticated() {
    return this.authenticated;
  }

  isLoaded() {
    return this.loaded;
  }

  // Load model
  getModel() {
    const self = this;
    $('#canvas').html('');
    $('.buttons-container').off('click', '#save-diagram');
    $('.buttons-container').off('click', '#analyse-diagram');
    self.viewer = null;
    this.http.get(config.backend.host + '/rest/directories/files/' + (this.viewerType === 'public' ? 'public/' : '') + this.modelId, this.authService.loadRequestOptions()).subscribe(
      success => {
        self.file = JSON.parse((<any>success)._body);
        self.fileId = self.file.id;
        if (self.file.content.length === 0) {
          alert('File can\'t be found or opened!');
        }
        if (this.viewerType === 'public' && this.isAuthenticated()) {
          self.getPermissions();
        } else {
          self.initCodemirror();
          self.openDiagram(self.file.content);
        }
        self.lastContent = self.file.content;
        document.title = 'Pleak SQL-privacy editor - ' + self.file.title;
        $('#fileName').text(this.file.title);
        self.lastModified = new Date().getTime();
      },
      fail => {
        self.fileId = null;
        self.file = null;
        self.lastContent = '';
      }
    );
  }

  initCodemirror() {
    if (this.codeMirror) {
      this.codeMirror.toTextArea();
    }
    this.codeMirror = CodeMirror.fromTextArea(document.getElementById('CodeEditor'), {
      mode: 'text/x-mysql',
      lineNumbers: true,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false,
      readOnly: !this.canEdit()
    });
    this.codeMirror.setSize('100%', 220);
  }

  getPermissions() {
    let self = this;
    this.http.get(config.backend.host + '/rest/directories/files/' + this.fileId, this.authService.loadRequestOptions()).subscribe(
      success => {
        let response = JSON.parse((<any>success)._body);
        self.file.permissions = response.permissions;
        self.file.user = response.user;
        self.file.md5Hash = response.md5Hash;
      },
      () => {},
      () => {
        self.initCodemirror();
        self.openDiagram(self.file.content);
      }
    );
  }

  canEdit() {
    let file = this.file;
    if (!file || !this.isAuthenticated()) { return false; }
    if ((this.authService.user && file.user) ? file.user.email === this.authService.user.email : false) { return true; }
      for (let pIx = 0; pIx < file.permissions.length; pIx++) {
        if (file.permissions[pIx].action.title === 'edit' &&
        this.authService.user ? file.permissions[pIx].user.email === this.authService.user.email : false) {
          return true;
        }
      }
    return false;
  }

  loadSQLScript(element) {
    let self = this;

    if (self.elementBeingEdited !== null) {
      self.canvas.removeMarker(self.elementBeingEdited, 'selected');
    }
    self.canvas.addMarker(element.id, 'selected');
    self.elementBeingEdited = element.id;

    let sqlQuery;
    if (element.sqlScript == null) {
      sqlQuery = "";
    } else {
      sqlQuery = element.sqlScript;
    }

    if (element.name) {
      $('.elementTitle').text(element.name);
    } else {
      $('.elementTitle').text('untitled');
    }

    self.sidebarComponent.isEditing = true;

    $('#SaveEditing').off('click');
    $('#SaveEditing').on('click', function () {
      self.saveSQLScript(element);
    });

    $('#CancelEditing').off('click');
    $('#CancelEditing').on('click', function () {
      self.closeSQLScriptPanel(element);
    });

    $('textarea#CodeEditor').val(sqlQuery);
    self.codeMirror.setValue(sqlQuery);
    setTimeout(function () {
      self.codeMirror.refresh();
    }, 10);
    self.elementOldValue = self.codeMirror.getValue();
  }

  closeSQLScriptPanel(element) {
    let self = this;
    if ((typeof element.sqlScript === "undefined" && self.codeMirror.getValue().length > 0) || (element.sqlScript && element.sqlScript != self.codeMirror.getValue())) {
      if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
        self.sidebarComponent.isEditing = false;
        self.elementBeingEdited = null;
        self.elementOldValue = "";
        self.canvas.removeMarker(element.id, 'selected');
      } else {
        self.canvas.addMarker(self.elementBeingEdited, 'selected');
        return false;
      }
    } else {
      self.sidebarComponent.isEditing = false;
      self.elementBeingEdited = null;
      self.elementOldValue = "";
      self.canvas.removeMarker(element.id, 'selected');
    }
  }

  saveSQLScript(element) {
    let self = this;
    element.sqlScript = self.codeMirror.getValue();
    self.updateModelContentVariable();
    self.sidebarComponent.isEditing = false;
    self.elementBeingEdited = null;
    self.elementOldValue = "";
    self.canvas.removeMarker(element.id, 'selected');
  }

  // Load diagram and add editor
  openDiagram(diagram: String) {
    const self = this;
    if (diagram && this.viewer == null) {
      this.viewer = new NavigatedViewer({
        container: '#canvas',
        keyboard: {
          bindTo: document
        },
        moddleExtensions: {
          sqlExt: SqlBPMNModdle
        }
      });
      this.eventBus = this.viewer.get('eventBus');
      this.overlays = this.viewer.get('overlays');
      this.canvas = this.viewer.get('canvas');

      this.viewer.importXML(diagram, () => {
        self.eventBus.on('element.click', function (e) {
          // User can select intermediate and sync data objects for leaks report
          if (is(e.element.businessObject, 'bpmn:DataObjectReference') && !!e.element.incoming.length) {
            if (!e.element.businessObject.selectedForReport) {
              self.selectedDataObjects.push(e.element.businessObject.name);
              e.element.businessObject.selectedForReport = true;
              self.canvas.addMarker(e.element.id, 'highlight-input-selected');
            } else {
              let index = self.selectedDataObjects.findIndex(x => x == e.element.businessObject.name);
              self.selectedDataObjects.splice(index, 1);
              e.element.businessObject.selectedForReport = false;
              self.canvas.removeMarker(e.element.id, 'highlight-input-selected');
            }
          } else {
            if ((is(e.element.businessObject, 'bpmn:DataObjectReference') || is(e.element.businessObject, 'bpmn:Task')) && !$(document).find("[data-element-id='" + e.element.id + "']").hasClass('highlight-input')) {
              let selectedElement = e.element.businessObject;
              if (self.elementBeingEdited !== null && self.elementBeingEdited === selectedElement.id && self.elementOldValue != self.codeMirror.getValue()) {
                self.canvas.addMarker(self.elementBeingEdited, 'selected');
                return false;
              } else if (self.elementBeingEdited !== null && self.elementBeingEdited !== selectedElement.id && self.elementOldValue != self.codeMirror.getValue()) {
                if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
                  self.loadSQLScript(selectedElement);
                } else {
                  self.canvas.addMarker(self.elementBeingEdited, 'selected');
                  self.canvas.removeMarker(e.element.id, 'selected');
                  return false;
                }
              } else {
                self.loadSQLScript(selectedElement);
              }
            }
            else {
              self.overlays.remove({ element: e.element });
            }
          }
        });
        this.loaded = true;
      });

      $('.buttons-container').on('click', '.buttons a', (e) => {
        if (!$(e.target).is('.active')) {
          e.preventDefault();
          e.stopPropagation();
        }
      });

      $('.buttons-container').on('click', '#save-diagram', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.save();
      });

      $('.buttons-container').on('click', '#analyse-diagram', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.sidebarComponent.clear();
        this.analyse();
      });

      $('.buttons-container').on('click', '#leaks-report', (e) => {
        e.preventDefault();
        e.stopPropagation();
        $('#leaksWhenInputError').hide();
        $('#leaksWhenServerError').hide();
        this.sidebarComponent.clear();
        this.buildSqlInTopologicalOrder();
      });

      $('.buttons-container').on('click', '#bpmn-leaks-report', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.sidebarComponent.clear();
          this.sendBpmnLeaksWhenRequest();
      });

      $(window).on('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
          switch (String.fromCharCode(e.which).toLowerCase()) {
            case 's':
              if ($('#save-diagram').is('.active')) {
                event.preventDefault();
                this.save();
              }
              break;
          }
        }
      });

      $(window).bind('beforeunload', (e) => {
        if (self.file.content != self.lastContent || (self.elementBeingEdited !== null && self.elementOldValue != self.codeMirror.getValue())) {
          return 'Are you sure you want to close this tab? Unsaved progress will be lost.';
        }
      });
    }
  }

  // Save model
  save() {
    var self = this;
    if ($('#save-diagram').is('.active')) {
      this.viewer.saveXML(
        {
          format: true
        },
        (err: any, xml: string) => {
          if (err) {
            console.log(err);
          } else {
            self.file.content = xml;
            this.http.put(config.backend.host + '/rest/directories/files/' + self.fileId, self.file, this.authService.loadRequestOptions()).subscribe(
              success => {
                if (success.status === 200 || success.status === 201) {
                  var data = JSON.parse((<any>success)._body);
                  $('#fileSaveSuccess').show();
                  $('#fileSaveSuccess').fadeOut(5000);
                  $('#save-diagram').removeClass('active');
                  var date = new Date();
                  self.lastModified = date.getTime();
                  localStorage.setItem("lastModifiedFileId", '"' + data.id + '"');
                  localStorage.setItem("lastModified", '"' + date.getTime() + '"');
                  if (self.fileId !== data.id) {
                    window.location.href = config.frontend.host + '/modeler/' + data.id;
                  }
                  self.file.md5Hash = data.md5Hash;
                  self.lastContent = self.file.content;
                  self.fileId = data.id;
                } else if (success.status === 401) {
                  $('#loginModal').modal();
                }
              },
              fail => {
              }
            );
            // console.log(xml)
          }
        });
    }
  }

  // Analyse model
  analyse() {
    $('#messageModal').find('.modal-title').text("Analysis in progress...");
    this.selectedDataObjects = [];
    this.viewer.saveXML({ format: true }, (err: any, xml: string) => {
      this.viewer.get("moddle").fromXML(xml, (err: any, definitions: any) => {
        if (typeof definitions !== 'undefined') {
          this.viewer.importDefinitions(definitions, () => this.postLoad(definitions));
        }
      });
    });
  }

  private bpmnLeaksWhen(response) {
      const $modal = $('#bpmnLeaksWhenModal');

      $modal.find('.modal-body').html(
      `<table>
          <thead>
          
          </thead>
          <tbody>

          </tbody>
        </table>`
      );

      $modal.find('.modal-title').text("BPMN LeaksWhen Report");

      $modal.find('table thead').html(function () {
          let output = `<th></th>`;

          response.inputs.forEach(function (item) {
              output += `<th><div><span>${item}</span></div></th>`;
          });

          return `<tr>${output}</tr>`;
      });

      $modal.find('table tbody').html(function () {
          let output = '';

          response.outputs.forEach(function (item, key) {
              const realKey = Object.keys(item)[0];
              const realItem = item[realKey];
              output += `<tr><th>${realKey}</th>`;

              realItem.forEach(function (rowValue) {
                  const realValue = Object.keys(rowValue)[0];
                  if (realValue === 'if') {
                      output += `<td class="${realValue}" data-toggle="tooltip" data-container="body" title="${rowValue[realValue]}">${realValue}</td>`;
                  } else {
                      output += `<td class="${realValue}">${realValue}</td>`;
                  }
              });

              output += '</tr>';
          });

          return output;
      });

      $modal.find('table tbody td').hover(
          function () {
              const $output = $(this).closest('table').find('thead th').eq($(this).index());
              const $input = $('th:first', $(this).parents('tr'));

              $output.addClass('highlighted');
              $input.addClass('highlighted');
          }, function () {
              const $output = $(this).closest('table').find('thead th').eq($(this).index());
              const $input = $('th:first', $(this).parents('tr'));

              $output.removeClass('highlighted');
              $input.removeClass('highlighted');
          });

      $modal.find('.modal-header').on('mousedown', function (event) {
          const startX = event.pageX;
          const startY = event.pageY;

          const $modalheader = $(this);
          const $modalContainer = $modalheader.closest('.modal-dialog');

          const modalX = parseInt($modalContainer.css('transform').split(',')[4]);
          const modalY = parseInt($modalContainer.css('transform').split(',')[5]);

          $modalheader.css('cursor', 'move');
          $modal.css('opacity', 0.3);

          const moveFunction = function (event) {
              const diffX = event.pageX - startX;
              const diffY = event.pageY - startY;

              $modalContainer.css('transform', `translate(${diffX + modalX}px, ${diffY + modalY}px)`);
              console.log('move');
          };

          $(document).on('mousemove', moveFunction);
          $(document).on('mouseup', function () {
              $(document).off('mousemove', moveFunction);
              $modal.css('opacity', 1);
          });
      });

      $('[data-toggle="tooltip"]', $modal).tooltip();
  }

  postLoad(definitions: any) {
    for (let diagram of definitions.diagrams) {
      var element = diagram.plane.bpmnElement;
      if (element.$type === "bpmn:Process") {
        this.processBPMNProcess(element);
      } else {
        for (let participant of element.participants) {
          if (participant.processRef) {
            this.processBPMNProcess(participant.processRef);
          }
        }
      }
    }
  }

  processBPMNProcess(element: any) {
    let registry = this.viewer.get('elementRegistry');
    let canvas = this.viewer.get('canvas');
    let eventBus = this.viewer.get('eventBus');
    let overlays = this.viewer.get('overlays');

    Analyser.analizeSQLDFlow(element, registry, canvas, overlays, eventBus, this.http, this.authService);
  }

  updateModelContentVariable() {
    this.viewer.saveXML(
      {
        format: true
      },
      (err: any, xml: string) => {
        if (xml) {
          this.file.content = xml;
          if (this.file.content != this.lastContent) {
            $('#save-diagram').addClass('active');
          }
        }
      }
    );
  }

  buildRuns(startBusinessObj) {
    var runs = [];
    var crun = [];
    var st = [startBusinessObj];
    var xorSplitStack = [];
    var marked = {};

    while (st.length > 0) {
      var curr = st.pop();
      crun.push(curr);

      let inc = curr.incoming ? curr.incoming.map(x => x.sourceRef) : null;
      let out = curr.outgoing ? curr.outgoing.map(x => x.targetRef) : null;

      var isAllPredecessorsInRun = !inc || inc.reduce((acc, cur) => acc && !!crun.find(x => x == cur), true);
      if (isAllPredecessorsInRun || curr.$type == 'bpmn:ExclusiveGateway' && out.length == 1 ||
          curr.$type == 'bpmn:EndEvent') {
        if (curr.$type == 'bpmn:ExclusiveGateway' && inc.length == 1) {
          curr.stackImage = st.slice();
          xorSplitStack.push(curr);

          marked[curr.id] = [out[0]];
          st.push(out[0]);
        } else {
          if (curr.$type != 'bpmn:EndEvent') {
            out.forEach(x => st.push(x));
          } else {
            runs.push(crun.slice());
            while (xorSplitStack.length > 0) {
              var top = xorSplitStack[xorSplitStack.length - 1];
              let xorOut = top.outgoing.map(x => x.targetRef);
              if (!xorOut.reduce((acc, cur) => acc && !!marked[top.id].find(x => x == cur), true)) {
                crun = crun.slice(0, crun.findIndex(x => x==top) + 1);

                var unmarked = xorOut.filter(x => !marked[top.id].find(y => y == x));
                marked[top.id].push(unmarked[0]);

                // not to loose possible parallel tasks
                st = top.stackImage;
                st.push(unmarked[0]);
                break;
              } else {
                marked[top.id] = [];
                xorSplitStack.pop();
              }
            }
          }
        }
      }
    }

    return runs;
  }

  private promises: Array<any> = [];

  buildSqlInTopologicalOrder() {
    let self = this;
    if (!self.selectedDataObjects.length) {
      $('#leaksWhenInputError').show();
    } else {
      this.viewer.saveXML({ format: true }, (err: any, xml: string) => {
        this.viewer.get("moddle").fromXML(xml, (err: any, definitions: any) => {
          var element = definitions.diagrams[0].plane.bpmnElement;
          let registry = this.viewer.get('elementRegistry');
          let info = dataFlowAnalysis(element, registry);
          let [dataFlowEdges, invDataFlowEdges, sources] = [info.dataFlowEdges, info.invDataFlowEdges, info.sources];
          let order = topologicalSorting(dataFlowEdges, invDataFlowEdges, sources);
          let processedLabels = self.selectedDataObjects.map(x => x.split(" ").map(word => word.toLowerCase()).join("_"));

          let analysisHtml = `<div class="spinner">
                <div class="double-bounce1"></div>
                <div class="double-bounce2"></div>
              </div>`;
          $('#messageModal').find('.modal-title').text("Analysis in progress...");
          $('#messageModal').find('.modal-body').html(analysisHtml);

          if (config.leakswhen.multi_runs) {
            let startEvent = null;
            for (var i in registry._elements) {
              if (registry._elements[i].element.type == "bpmn:StartEvent") {
                startEvent = registry._elements[i].element.businessObject;
                break;
              }
            }

            if (!!startEvent) {
              let runs = self.buildRuns(startEvent).map(x => x.filter(y => y.$type == 'bpmn:Task').map(y => y.id));

              runs.forEach(run => {
                let sqlCommands = run.reduce(function (sqlCommands, id) {
                  let task = registry.get(id);
                  task.incoming.filter(x => x.type=='bpmn:DataInputAssociation')
                               .map(x => x.businessObject.sourceRef[0].sqlScript)
                               .forEach(sql => {
                                 if(sql && sqlCommands.indexOf(sql) == -1)
                                    sqlCommands += sql + '\n\n';
                                });
                  let sql = task.businessObject.sqlScript;
                  sqlCommands += sql + '\n\n';
                  return sqlCommands;
                }, "");

                self.sendLeaksWhenRequest(sqlCommands, processedLabels);
              });
            }
          } else {
              let sqlCommands = order.reduce(function (sqlCommands, id) {
              let obj = registry.get(id);
              if (obj.type == "bpmn:DataObjectReference" && !obj.incoming.length ||
                obj.type == "bpmn:Task") {
                let sql = obj.businessObject.sqlScript;
                sqlCommands += sql + '\n\n';
              }
              return sqlCommands;
            }, "");

            self.sendLeaksWhenRequest(sqlCommands, processedLabels);
          }

          return Promise.all(self.promises).then(res => {
            setTimeout(() => { $('#messageModal').modal('toggle'); }, 500);
          });
        });
      });
    }
  }

  sendBpmnLeaksWhenRequest() {
    let analysisHtml = `
      <div class="spinner">
        <div class="double-bounce1"></div>
        <div class="double-bounce2"></div>
      </div>`;
    $('#bpmnLeaksWhenModal').find('.modal-title').text("Analysis in progress...");
    $('#bpmnLeaksWhenModal').find('.modal-body').html(analysisHtml);
    $('#bpmnLeaksWhenModal').modal();
    this.viewer.saveXML(
      {
        format: true
      },
      (err: any, xml: string) => {
        if (err) {
          console.log(err);
          $('#bpmnLeaksWhenModal').modal('toggle');
        } else {
          this.http.post(config.backend.host + '/rest/sql-privacy/analyze-leaks-when', {model: xml}, this.authService.loadRequestOptions()).subscribe(
            success => {
              const response = JSON.parse((<any>success)._body);
              this.bpmnLeaksWhen(JSON.parse(response.result));
            },
            () => {
              console.log("analysis failed");
              $('#bpmnLeaksWhenModal').modal('toggle');
            }
          );
        }
      });
  }
  sendLeaksWhenRequest(sqlCommands, processedLabels) {
    let self = this;

    self.promises.push(new Promise((resolve, reject) => {
      $('#messageModal').modal();

      let apiURL = config.leakswhen.host + config.leakswhen.report;
      self.http.post(apiURL, {name: "tmp", targets: processedLabels.join(','), sql_script: sqlCommands})
        .toPromise()
        .then(
          res => {
            let files = res.json().files;
            let legend = files.filter(x => x.indexOf('legend') != -1)[0];
            let namePathMapping = {};
            files.filter(x => x.indexOf('legend') == -1)
                 .forEach(path => namePathMapping[path.split('/').pop()] = path);

            //let url1 = config.leakswhen.host + legend.replace("leaks-when/", "");
            let url1 = config.leakswhen.host + legend;
            self.http.get(url1)
            .toPromise()
            .then(res => {
                let legendObject = res.json();
                let orderTasks = [];
                let currentProcessingTaskIndex = 0;

                let resultGraphsInfo = []

                for (var key in legendObject) {
                  let overlayInsert = ``;
                  let counter = 0;
                  let clojuredKey = key;
                  let fileQuery = (index) => {
                    //let url2 = config.leakswhen.host + namePathMapping[legendObject[clojuredKey][index]].replace("leaks-when/", "");
                    let url2 = config.leakswhen.host + namePathMapping[legendObject[clojuredKey][index]];

                    self.http.get(url2)
                      .toPromise()
                      .then(res => {
                          let response = (<any>res)._body;

                          let urlParts = url2.split("/");
                          let fileNameParts = url2.split("/")[urlParts.length-1].split(".")[0].split("_");
                          let gid = fileNameParts[fileNameParts.length-1];

                          overlayInsert += `
                            <div align="left" class="panel-heading">
                              <b>` + clojuredKey + '(' + counter + ')' + `</b>
                            </div>
                            <div class="panel-body">
                              <div>
                                <a href="` + config.frontend.host + '/graph/' + parseInt(gid) + `" target="_blank">View graph</a>
                              </div>
                            </div>`;

                          if (counter == Object.keys(legendObject[clojuredKey]).length - 1) {
                            var overlayHtml = $(`
                                <div class="code-dialog" id="` + clojuredKey + `-analysis-results">
                                  <div class="panel panel-default">`+ overlayInsert + `</div></div>`
                            );
                            Analyser.onAnalysisCompleted.emit({ node: { id: "Output" + clojuredKey + counter, name: clojuredKey }, overlayHtml: overlayHtml });
                            if (orderTasks[++currentProcessingTaskIndex]){
                              orderTasks[currentProcessingTaskIndex](0);
                            }
                          } else {
                            fileQuery(++counter);
                          }
                        },
                        msg => {
                          reject(msg);
                        });
                  };
                  orderTasks.push(fileQuery);
                }
                orderTasks[currentProcessingTaskIndex](0);
              },
              msg => {
                reject(msg);
              });

            resolve();
          },
          err => {
            $('#leaksWhenServerError').show();
            resolve();
          }
        );
    }));
  }

  ngOnInit() {
    window.addEventListener('storage', (e) => {
      if (e.storageArea === localStorage) {
        if (!this.authService.verifyToken()) {
          this.getModel();
        } else {
          let lastModifiedFileId = Number(localStorage.getItem('lastModifiedFileId').replace(/['"]+/g, ''));
          let currentFileId = null;
          if (this.file) {
            currentFileId = this.file.id;
          }
          let localStorageLastModifiedTime = Number(localStorage.getItem('lastModified').replace(/['"]+/g, ''))
          let lastModifiedTime = this.lastModified;
          if (lastModifiedFileId && currentFileId && localStorageLastModifiedTime && lastModifiedTime && lastModifiedFileId == currentFileId && localStorageLastModifiedTime > lastModifiedTime) {
            this.getModel();
          }
        }
      }
    });

    Analyser.onAnalysisCompleted.subscribe(result => {
      this.sidebarComponent.emitTaskResult(result);
    });

  }
}