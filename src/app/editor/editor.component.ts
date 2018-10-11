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
            if ((is(e.element.businessObject, 'bpmn:DataObjectReference') || is(e.element.businessObject, 'bpmn:Task') || is(e.element.businessObject, 'bpmn:StartEvent')) && !$(document).find("[data-element-id='" + e.element.id + "']").hasClass('highlight-input')) {
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

  to_ll_net(petri) {
    // Format for arcs is like 5>16 so we need indices instead of ids
    var i = 1; // index for places
    var j = 1; // index for transitions
    var str = "PEP\nPetriBox\nFORMAT_N2\nPL\n";
    for (var el in petri) {
      if (petri[el].type == "place") {
        petri[el].index = i++;
        str += '"' + el + '"';

        var isInputFound = false;
        for (var el2 in petri) {
          if (petri[el2].out.findIndex(x => x == el) != -1) {
            isInputFound = true;
            break;
          }
        }

        petri[el].isInputFound = isInputFound;

        // Add 1 token for start events or source data objects
        if (!isInputFound) {
          str += "M1";
        }

        str += "\n";
      }
    }

    str += "TR\n";

    for (var el in petri) {
      if (petri[el].type == "transition") {
        petri[el].index = j++;
        str += '"' + el + '"\n';
      }
    }

    str += "TP\n";

    for (var el in petri) {
      if (petri[el].type == "transition") {
        petri[el].out.forEach(x => {
          str += petri[el].index + "<" + petri[x].index + "\n";
        });
      }
    }

    str += "PT\n";

    for (var el in petri) {
      if (petri[el].type == "place" && (!el.includes("DataObject") || el.includes("DataObject") && petri[el].isInputFound)) {
        petri[el].out.forEach(x => {
          str += petri[el].index + ">" + petri[x].index + "\n";
        });
      }
    }

    str += "RA\n";

    for (var el in petri) {
      if (petri[el].type == "place" && el.includes("DataObject") && !petri[el].isInputFound) {
        petri[el].out.forEach(x => {
          str += petri[x].index + "<" + petri[el].index + "\n";
        });
      }
    }

    var sampleStr = `PEP
PetriBox
FORMAT_N2
% author ""
% title ""
% date ""
% note ""
% version ""
PL
1"p0:c0"9@9M1
2"DataObjectReference_0wubi9g:c1"9@9M1
3"DataObjectReference_0orzhva:c2"9@9M1
4"DataObjectReference_0tqjrqv:c3"9@9
5"p1:c4"9@9
6"p2:c5"9@9
7"DataObjectReference_1y1amaq:c6"9@9
8"p3:c7"9@9
9"p4:c8"9@9
10"p5:c9"9@9
11"p6:c10"9@9
12"DataObjectReference_0tqjrqv:c11"9@9
13"p7:c12"9@9
14"p2:c13"9@9
TR
15"Task_09nvtvy:e0"9@9
16"ExclusiveGateway_1t4643d0:e1"9@9
17"Task_1x824b9:e2"9@9
18"ExclusiveGateway_1t35uvf1:e3"9@9
19"ExclusiveGateway_1t35uvf0:e4"9@9
20"Task_1qho87z:e5"9@9
21"Task_17bpyo0:e6"9@9
22"ExclusiveGateway_1t4643d1:*e7"9@9
TP
15<5
15<4
16<6
17<7
17<8
18<10
19<9
20<12
20<13
21<11
22<14
PT
1>15
5>16
4>17
6>17
8>18
8>19
7>20
9>20
7>21
10>21
13>22
RA
15<2
20<3`;
    // this.from_ll_net(sampleStr);
    return str;
  }

  from_ll_net(ll_net) {
    var petri = {};
    var lines = ll_net.split('\n');
    // console.log(lines);

    var curr = null;
    while ((curr = lines.shift()) != "PL") { };

    // Places
    while ((curr = lines.shift()) != "TR") {
      var parts = curr.split('"');
      var llIndex = parseInt(parts[0]);
      var objectId = parts[1];
      petri[objectId] = { type: "place", out: [], ll_index: llIndex };
    }

    // Transitions
    while ((curr = lines.shift()) != "TP") {
      var parts = curr.split('"');
      var llIndex = parseInt(parts[0]);
      var objectId = parts[1];
      petri[objectId] = { type: "transition", out: [], ll_index: llIndex };
    }

    // Transition -> Place
    while ((curr = lines.shift()) != "PT") {
      var parts = curr.split('<');
      var inIndex = parseInt(parts[0]);
      var outIndex = parts[1];

      for (var el in petri) {
        if (petri[el].ll_index == inIndex) {
          var inputObj = el;
        }
        if (petri[el].ll_index == outIndex) {
          var outputObj = el;
        }
      }

      petri[inputObj].out.push(outputObj);
    }

    // Place -> Transition
    while ((curr = lines.shift()) != "RA") {
      var parts = curr.split('>');
      var inIndex = parseInt(parts[0]);
      var outIndex = parts[1];

      for (var el in petri) {
        if (petri[el].ll_index == inIndex) {
          var inputObj = el;
        }
        if (petri[el].ll_index == outIndex) {
          var outputObj = el;
        }
      }

      petri[inputObj].out.push(outputObj);
    }

    // Read arcs
    while (lines != "") {
      curr = lines.shift();
      var parts = curr.split('<');
      var inIndex = parseInt(parts[0]);
      var outIndex = parts[1];

      for (var el in petri) {
        if (petri[el].ll_index == inIndex) {
          var inputObj = el;
        }
        if (petri[el].ll_index == outIndex) {
          var outputObj = el;
        }
      }

      petri[inputObj].out.push(outputObj);
      petri[outputObj].out.push(inputObj);
    }

    // Object.keys(petri).forEach(k => petri["id"] = k);
    // console.log(JSON.stringify(Object.values(petri)));
    return petri;
  }

  buildGraph(petri) {
    // Building in ll_net format
    function onlyUnique(value, index, self) {
      return self.indexOf(value) === index;
    }

    for (var el in petri) {
      petri[el].out = petri[el].out.filter(onlyUnique);
    }

    // Removing redundant nodes before/after xor gateway
    for (var el in petri) {
      if (el.includes("ExclusiveGateway")) {
        var copies = 0;

        if (petri[el].out.length > 1) {

          var preceeding = Object.values(petri).find(x => !!x["out"].find(z => z == el));
          preceeding["out"] = [];
          for (var i = 0; i < petri[el].out.length; i++) {
            copies++;
            var copy = el + i;
            preceeding["out"].push(copy);
            petri[copy] = { type: petri[el].type, out: [petri[el].out[i]] };
          }
        }
        else {
          var preceedings = Object.values(petri).filter(x => !!x["out"].find(z => z == el));
          for (var i = 0; i < preceedings.length; i++) {
            copies++;
            var copy = el + i;
            preceedings[i]["out"] = [copy];
            petri[copy] = { type: petri[el].type, out: [petri[el].out[0]] };
          }
        }

        delete petri[el];

        // for(var el2 in petri) {
        //   var oldIdIndex = petri[el2].out.indexOf(x => x == el);
        //   if(oldIdIndex != -1) {
        //     petri[el2].out[oldIdIndex] = petri[el2].out[oldIdIndex] + copies;
        //   }
        // }
      }
    }

    for (var el in petri) {
      if (petri[el].type == "place") {
        var isInputFound = false;
        for (var el2 in petri) {
          if (petri[el2].out.findIndex(x => x == el) != -1) {
            isInputFound = true;
            break;
          }
        }

        petri[el].isInputFound = isInputFound;
      }
    }

    // var str2 = this.to_ll_net(petri);
    // console.log(str2);
    // return;

    // Building in dot format

    var str = "digraph G { rankdir=LR; ";
    for (var el in petri) {
      if (petri[el].type == "transition") {
        str += el + ' [shape=box,label="' + (petri[el].label ? petri[el].label : el) + '"]; ';
      }
      else {
        str += el + ' [label="' + (petri[el].label ? petri[el].label : el) + '"]; ';
      }
    }

    for (var el in petri) {
      petri[el].out.forEach(x => {
        str += el + " -> " + x + "; ";
      });
    }

    str += " }";

    str = str.replace(/[^\x20-\x7E]/g, '');
    // console.log(str);
  }

  // To refresh the state of diagram and be able to run analyser again
  removePetriMarks() {
    let registry = this.viewer.get('elementRegistry');
    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if (node['petriPlace']) {
        delete node['petriPlace'];
      }
      if (node['isProcessed']) {
        delete node['isProcessed'];
      }
      if (!!node.businessObject) {
        if (node.businessObject['petriPlace']) {
          delete node.businessObject['petriPlace'];
        }
        if (node.businessObject['isProcessed']) {
          delete node.businessObject['isProcessed'];
        }
      }
    }
  }

  buildPetriNet(registry, startBusinessObj, petri, maxPlaceNumberObj) {
    var crun = [];
    var st = [startBusinessObj];
    var xorSplitStack = [];

    while (st.length > 0) {
      var curr = st.pop();
      crun.push(curr);

      let inc = curr.incoming ? curr.incoming.map(x => x.sourceRef) : null;
      let out = curr.outgoing ? curr.outgoing.map(x => x.targetRef) : null;

      if (curr.outgoing && curr.$type != "bpmn:DataObjectReference") {
        curr.outgoing.forEach(x => {
          var name = curr.id;
          if (!is(curr, 'bpmn:StartEvent')) {
            name = x.petriPlace ? x.petriPlace : "p" + maxPlaceNumberObj.maxPlaceNumber++;
          }

          if (is(x.targetRef, 'bpmn:EndEvent')) {
            name = x.targetRef.id;
          }

          x.petriPlace = name;

          if (!petri[name]) {
            petri[name] = { out: [], type: "place" };
          }
        });
      }

      if (curr.$type == "bpmn:DataObjectReference") {
        petri[curr.id] = {
          out: out.length ? out.map(x => x.id) : [],
          type: "place"
        };
      }

      if (curr.outgoing && curr.incoming && !curr.isProcessed) {
        var ident = curr.id;
        if (curr.$type == "bpmn:ParallelGateway") {
          ident = ident.replace("Exclusive", "Parallel");
        }

        if (!petri[ident]) {
          petri[ident] = {
            out: curr.outgoing.map(x => x.petriPlace),
            type: "transition"
          };
        }
        else {
          petri[ident].out = petri[ident].out.concat(curr.outgoing.map(x => x.petriPlace));
        }

        curr.incoming.forEach(x => {
          if (x.petriPlace && !petri[x.petriPlace].out.find(z => z == ident)) {
            petri[x.petriPlace].out.push(ident);
          }
        });

        curr.isProcessed = curr.incoming.reduce((acc, cur) => {
          return acc && !!cur.petriPlace;
        }, true);
      }

      var isAllPredecessorsInRun = !inc || inc.reduce((acc, cur) => acc && !!crun.find(x => x == cur), true);
      if (isAllPredecessorsInRun || curr.$type == 'bpmn:ExclusiveGateway' && out.length == 1 ||
        curr.$type == 'bpmn:EndEvent') {
        if (!!curr.stackImage) {
          // Cycle check
          continue;
        }
        if (curr.$type == 'bpmn:ExclusiveGateway' && inc.length == 1) {
          curr.stackImage = st.slice();
          xorSplitStack.push(curr);
          // st.push(out[0]);
          out.forEach(x => st.push(x));
        }
        else {
          if (curr.$type != 'bpmn:EndEvent') {
            out.forEach(x => st.push(x));
          }
        }
      }
    }

    // Data Objects handling
    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if (is(node.businessObject, 'bpmn:Task') && petri[node.id]) {
        petri[node.id].label = node.businessObject.name;

        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          node.businessObject.dataInputAssociations.forEach(x => {
            if (!petri[x.sourceRef[0].id]) {
              petri[x.sourceRef[0].id] = { type: "place", out: [node.id], label: x.sourceRef[0].name }
            }
            else {
              petri[x.sourceRef[0].id].out.push(node.id);
            }
            // if(petri[node.id].out.findIndex(y => y == x.sourceRef[0].id) == -1)
            //   petri[node.id].out.push(x.sourceRef[0].id);
          });
        }

        if (node.businessObject.dataOutputAssociations && node.businessObject.dataOutputAssociations.length) {
          node.businessObject.dataOutputAssociations.forEach(x => {
            if (petri[node.id].out.findIndex(y => y == x.targetRef.id) == -1)
              petri[node.id].out.push(x.targetRef.id);
            if (!petri[x.targetRef.id]) {
              petri[x.targetRef.id] = { type: "place", out: [], label: x.targetRef.name }
            }
          });
        }
      }
    }

    // Handling message flow
    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if (node.type == "bpmn:MessageFlow" && !node.isProcessed) {
        var source = node.businessObject.sourceRef;
        var target = node.businessObject.targetRef;

        // New place for message flow
        var newId = "";
        // In case of message flow to start event in another lane
        // we don't need a new place, because start event is already a place
        if (is(target, 'bpmn:StartEvent')) {
          newId = target.id;
        }
        else {
          newId = "p" + maxPlaceNumberObj.maxPlaceNumber++;
          petri[newId] = { type: "place", out: [target.id], label: newId }
        }

        if (!petri[source.id]) {
          petri[source.id] = { type: "transition", out: [newId], label: source.name }
        }
        else {
          petri[source.id].out.push(newId);
        }

        node.isProcessed = true;
      }
    }

    return petri;
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
        }
        else {
          if (curr.$type != 'bpmn:EndEvent') {
            out.forEach(x => st.push(x));
          } else {
            runs.push(crun.slice());
            while (xorSplitStack.length > 0) {
              var top = xorSplitStack[xorSplitStack.length - 1];
              let xorOut = top.outgoing.map(x => x.targetRef);
              if (!xorOut.reduce((acc, cur) => acc && !!marked[top.id].find(x => x == cur), true)) {
                crun = crun.slice(0, crun.findIndex(x => x == top) + 1);

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
          // let info = dataFlowAnalysis(element, registry);
          // let [dataFlowEdges, invDataFlowEdges, sources] = [info.dataFlowEdges, info.invDataFlowEdges, info.sources];
          // let order = topologicalSorting(dataFlowEdges, invDataFlowEdges, sources);

          let processedLabels = self.selectedDataObjects[0]
            ? self.selectedDataObjects.map(x => x.split(" ").map(word => word.toLowerCase()).join("_"))
            : self.selectedDataObjects;

          let analysisHtml = `<div class="spinner">
                <div class="double-bounce1"></div>
                <div class="double-bounce2"></div>
              </div>`;
          $('#messageModal').find('.modal-title').text("Analysis in progress...");
          $('#messageModal').find('.modal-body').html(analysisHtml);

          let serverResponsePromises = [];

          if (config.leakswhen.multi_runs) {
            let startEvents = [];
            for (var i in registry._elements) {
              if (registry._elements[i].element.type == "bpmn:StartEvent") {
                startEvents.push(registry._elements[i].element.businessObject);
              }
            }

            if (!!startEvents) {
              let petri = {};
              let maxPlaceNumberObj = { maxPlaceNumber: 0 };
              // For multiple lanes we have multiple start events
              for (var j = 0; j < startEvents.length; j++) {
                petri = self.buildPetriNet(registry, startEvents[j], petri, maxPlaceNumberObj);
              }

              this.buildGraph(petri);

              let matcher = {};
              Object.keys(petri).forEach(k => {
                petri[k]["id"] = k;

                for (var i in registry._elements) {
                  let obj = registry.get(k);
                  if (!!obj && obj.businessObject.sqlScript) {
                    matcher[k] = obj.businessObject.sqlScript;
                  }
                }
              });
              let adjustedPetri = Object.values(petri);
              // console.log(adjustedPetri);
              // console.log(JSON.stringify(adjustedPetri));

              self.removePetriMarks();

              let serverPetriFileName = self.file.id + "_" + self.file.title.substring(0, self.file.title.length - 5);
              self.sendPreparationRequest(serverPetriFileName, JSON.stringify(adjustedPetri), processedLabels, matcher, serverResponsePromises);
            }
          }


          $('#messageModal').modal('show');
          setTimeout(() => {
            Promise.all(serverResponsePromises);
          }, 500);
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
 
  sendPreparationRequest(diagramId, petri, processedLabels, matcher, promises) {
    let self = this;
    let apiURL = config.leakswhen.host + config.leakswhen.compute;

    self.http.post(apiURL, { diagram_id: diagramId, petri: petri })
      .toPromise()
      .then(
        res => {
          let runs = res.json().runs;
          // console.log(runs);

          // Matching ids from result and sql scripts
          let sqlCommands = "";
          runs.filter(run => {
            return run.reduce((acc, cur) => { return acc && cur.substring('EndEvent') != -1 }, true);
          }).forEach(run => {
            for (let i = 0; i < run.length; i++) {
              sqlCommands += matcher[run[i]] ? matcher[run[i]] + "\n" : "";
            }
            self.sendLeaksWhenRequest(sqlCommands, processedLabels, promises);
          });
        },
        err => {
          $('#leaksWhenServerError').show();
        }
      );
  }

  sendLeaksWhenRequest(sqlCommands, processedLabels, promises) {
    let self = this;

    let filesAreReady = false;
    promises.push(new Promise((resolve, reject) => {
      let apiURL = config.leakswhen.host + config.leakswhen.report;
      self.http.post(apiURL, { name: "tmp", targets: processedLabels.join(','), sql_script: sqlCommands })
        .toPromise()
        .then(
          res => {
            let files = res.json().files;
            let legend = files.filter(x => x.indexOf('legend') != -1)[0];
            let namePathMapping = {};
            files.filter(x => x.indexOf('legend') == -1)
              .forEach(path => namePathMapping[path.split('/').pop()] = path);

            self.http.get(config.leakswhen.host + legend)
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
                              else {
                                if(!filesAreReady) {
                                  filesAreReady = true;
                                  $('#messageModal').modal('hide');
                                }
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
        resolve(self.stat++);
    }));
  }
  private stat = 4;
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