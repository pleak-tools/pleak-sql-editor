import { Component, OnInit, Input, ViewChild, EventEmitter, Output } from '@angular/core';
import { Http } from '@angular/http';
import { AuthService } from "../auth/auth.service";
import { SqlBPMNModdle } from "./bpmn-labels-extension";
import { Analyser } from "../analyser/SQLDFlowAnalizer";
import { PetriNets } from "../analyser/PetriNets";
import { LeaksWhenRequests } from "./leaks-when-requests";
import { PolicyHelper } from "./policy-helper";
import { SidebarComponent } from '../sidebar/sidebar.component';
import { GAPanelComponent } from '../ga-panel/ga-panel.component';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { ElementsHandler } from "./elements-handler";
import { SimpleDisclosureAnalysis } from "./simple-analysis";

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
  @Output() editSqlTable: EventEmitter<any> = new EventEmitter();

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
      if (typeof (status) === 'boolean') {
        this.getModel();
      }
    });
    this.getModel();
  }

  @Input() authenticated: Boolean;
  @ViewChild(SidebarComponent) sidebarComponent: SidebarComponent;
  @ViewChild(GAPanelComponent) gaPanelComponent: GAPanelComponent;
  @ViewChild(ElementsHandler) elementsHandler: ElementsHandler;

  private loaded: boolean = false;

  private viewer: NavigatedViewer;
  private eventBus;
  private overlays;
  private canvas;

  private modelId;
  private viewerType;
  private menuSelector;

  private lastContent: String = '';
  private codeMirror: any;
  private fileId: Number = null;
  private file: any;
  private lastModified: Number = null;
  private selectedDataObjects: Array<any> = [];
  private taskDtoOrdering = {};

  private roles: Array<any> = [];

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
      () => { },
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

  saveSQLScript(e) {
    let self = this;
    if (!e.type)
      e.element.sqlScript = self.codeMirror.getValue();
    else
      e.element.policyScript = self.codeMirror.getValue();

    self.updateModelContentVariable();
    self.sidebarComponent.isEditing = false;
    self.sidebarComponent.elementBeingEdited = null;
    self.sidebarComponent.elementOldValue = "";

    if (e.element && e.element.id)
      self.canvas.removeMarker(e.element.id, 'selected');
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
      setTimeout(() => {
        self.sidebarComponent.init(self.canvas, self.codeMirror);
      }, 100);

      self.sidebarComponent.save.subscribe(({ element, type }) => self.saveSQLScript({ element, type }));
      self.elementsHandler = new ElementsHandler(this.viewer, diagram, pg_parser, this, this.canEdit());

      this.viewer.importXML(diagram, () => {
        this.viewer.get("moddle").fromXML(diagram, (_err: any, definitions: any) => {
          if (typeof definitions !== 'undefined') {
            this.viewer.importDefinitions(definitions, () => this.elementsHandler.createElementHandlerInstances(definitions));
          }
        });

        self.eventBus.on('element.click', function (e) {
          // User can select intermediate and sync data objects for leaks report
          if (is(e.element.businessObject, 'bpmn:DataObjectReference') || is(e.element.businessObject, 'bpmn:Participant')) {
            if (e.element.incoming && e.element.incoming.length || is(e.element.businessObject, 'bpmn:Participant')) {
              self.showMenu(e);
            }
            else {
              self.elementsHandler.click(e.element);
            }
          } else {
            if (self.menuSelector) {
              self.overlays.remove({ id: self.menuSelector });
              self.menuSelector = null;
            }

            if ((is(e.element.businessObject, 'bpmn:Task') || is(e.element.businessObject, 'bpmn:StartEvent') || is(e.element.businessObject, 'bpmn:IntermediateCatchEvent')) && !$(document).find("[data-element-id='" + e.element.id + "']").hasClass('highlight-input')) {
              let selectedElement = e.element.businessObject;
              if (self.sidebarComponent.elementBeingEdited !== null && self.sidebarComponent.elementBeingEdited === selectedElement.id && self.sidebarComponent.elementOldValue != self.codeMirror.getValue()) {
                self.canvas.addMarker(self.sidebarComponent.elementBeingEdited, 'selected');
                return false;
              } else if (self.sidebarComponent.elementBeingEdited !== null && self.sidebarComponent.elementBeingEdited !== selectedElement.id && self.sidebarComponent.elementOldValue != self.codeMirror.getValue()) {
                if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
                  self.sidebarComponent.loadSQLScript(selectedElement, 0);
                } else {
                  self.canvas.addMarker(self.sidebarComponent.elementBeingEdited, 'selected');
                  self.canvas.removeMarker(e.element.id, 'selected');
                  return false;
                }
              } else {
                self.sidebarComponent.loadSQLScript(selectedElement, 0);
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
        this.runLeaksWhenAnalysis();
      });

      $('.buttons-container').on('click', '#ga-analysis', (e) => {
        e.preventDefault();
        e.stopPropagation();
        let registry = this.viewer.get('elementRegistry');
        let gaInputs = PolicyHelper.getParticipantsInfoForGA(registry);
        this.gaPanelComponent.init(gaInputs, registry, this.canvas);
      });

      $('.buttons-container').on('click', '#sd-analysis', (e) => {
        e.preventDefault();
        e.stopPropagation();
        let registry = this.viewer.get('elementRegistry');
        SimpleDisclosureAnalysis.showPopup(registry);

        $(document).off('click', '#simpleLeaksWhen');
        $(document).on('click', '#simpleLeaksWhen', (e) => {
          let processedTarget = SimpleDisclosureAnalysis.SelectedTarget.simplificationDto.name.split(" ").map(word => word.toLowerCase()).join("_");
          self.runLeaksWhenAnalysis(processedTarget, SimpleDisclosureAnalysis.SelectedTarget.selectedTargetForLeaksWhen);
        });
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
    }
  }

  // initDataDepenenciesResultTableHiglights(row: number, col: number): void {
    // this.removeModelDependencyHiglights();
    // $(document).find('#simpleDisclosureReportModal').find('.modal-dialog').addClass('dd-transparent');
    // $(document).find('.dd-col-h, .dd-row-h').css('background-color', '#f5f5f5').css('color', 'black');
    // $(document).find('.dd-col, .dd-row').css('background-color', 'white').css('color', 'black');
    // $(document).find('.dd-c-' + col).css('background-color', 'springgreen').css('color', 'white');
    // $(document).find('.dd-r-' + row).css('background-color', 'lightcoral').css('color', 'white');
    // $(document).find('.dd-' + row + '-' + col).css('background-color', 'deepskyblue').css('color', 'white');

    // let inputs = this.elementsHandler.getDataObjectHandlersByDataObjectName(clickedDataObject.path.input);
    // for (let input of inputs) {
    //   this.canvas.addMarker(input.dataObject.id, 'highlight-dd-input');
    // }

    // let outputs = this.elementsHandler.getDataObjectHandlersByDataObjectName(clickedDataObject.path.output);
    // for (let output of outputs) {
    //   this.canvas.addMarker(output.dataObject.id, 'highlight-dd-output');
    // }

    // for (let betweens of clickedDataObject.path.between) {
    //   for (let between of this.elementsHandler.getDataObjectHandlersByDataObjectName(betweens)) {
    //     this.canvas.addMarker(between.dataObject.id, 'highlight-dd-between');
    //   }
    // }
  // }

  showMenu(e) {
    let element = e.element;
    let self = this;
    let overlayHtml = `
      <div class="panel panel-default stereotype-editor" id="` + element.businessObject.id + `-stereotype-selector" style="height: ` +
      (!is(e.element.businessObject, 'bpmn:Participant') ? '150px' : '75px') +
      `">
        <div class="stereotype-editor-close-link" style="float: right; color: darkgray; cursor: pointer">X</div>
        <div class="stereotype-selector-main-menu">
          <div style="margin-bottom:10px; min-width: 130px">
            <b>SQL Menu</b>
          </div>
          <table class="table table-hover stereotypes-table">
            <tbody>
            `+ (!is(e.element.businessObject, 'bpmn:Participant')
        ? `<tr>
                  <td class="link-row" id="select-button" style="cursor: pointer">` + (element.businessObject.selectedForReport ? "Deselect" : "Select") + `</td>
                </tr>
                <tr>
                  <td class="link-row" id="sql-script-button" style="cursor: pointer">Edit SQL table</td>
                </tr>`
        : ``) +
      `<tr>
                <td class="link-row" id="policy-button" style="cursor: pointer">Edit policy</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    overlayHtml = $(overlayHtml);
    let registry = this.viewer.get('elementRegistry');

    if (self.menuSelector) {
      self.overlays.remove({ id: self.menuSelector });
    }

    $(overlayHtml).on('click', '.stereotype-editor-close-link', (e) => {
      self.overlays.remove({ id: self.menuSelector });
      self.menuSelector = null;
    });

    $(overlayHtml).on('click', '#select-button', (e) => {
      if (!element.businessObject.selectedForReport) {
        self.selectedDataObjects.push(element.businessObject);
        element.businessObject.selectedForReport = true;
        self.canvas.addMarker(element.id, 'highlight-input-selected');
        $("#select-button").text("Deselect");
      } else {
        let index = self.selectedDataObjects.findIndex(x => x == element.businessObject);
        self.selectedDataObjects.splice(index, 1);
        element.businessObject.selectedForReport = false;
        self.canvas.removeMarker(element.id, 'highlight-input-selected');
        $("#select-button").text("Select");
      }
      self.overlays.remove({ id: self.menuSelector });
      self.menuSelector = null;
    });

    $(overlayHtml).on('click', '#policy-button', (e) => {
      this.sidebarComponent.clear();
      self.roles = PolicyHelper.extractRoles(registry);
      self.sidebarComponent.loadSQLScript(element.businessObject, 1, self.roles);
      self.overlays.remove({ id: self.menuSelector });
    });

    $(overlayHtml).on('click', '#sql-script-button', (e) => {
      this.sidebarComponent.clear();
      self.overlays.remove({ id: self.menuSelector });
      self.elementsHandler.click(element);
    });

    let overlayPosition = !is(element.businessObject, 'bpmn:Participant')
      ? { right: 0, bottom: 0 }
      // : {top: e.originalEvent.clientX - element.x, left: e.originalEvent.clientY - element.y};
      : { top: 5, left: 40 };

    let menuOverlay = this.overlays.add(registry.get(element.businessObject.id), {
      position: overlayPosition,
      show: {
        minZoom: 0,
        maxZoom: 5.0
      },
      html: overlayHtml
    });
    self.menuSelector = menuOverlay;
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
        // console.log('move');
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

  runLeaksWhenAnalysis(simplificationTarget=null, outputTarget=null) {
    let self = this;
    if (!self.selectedDataObjects.length && !outputTarget) {
      $('#leaksWhenInputError').show();
    } else {
      this.viewer.saveXML({ format: true }, (err: any, xml: string) => {
        this.viewer.get("moddle").fromXML(xml, (err: any, definitions: any) => {
          let registry = this.viewer.get('elementRegistry');

          // Displaying the spinner during analysis
          let analysisHtml = `<div class="spinner">
                <div class="double-bounce1"></div>
                <div class="double-bounce2"></div>
              </div>`;
          $('#messageModal').find('.modal-title').text("Analysis in progress...");
          $('#messageModal').find('.modal-body').html(analysisHtml);

          // Promise chain for async requests
          let serverResponsePromises = [];

          let startBpmnEvents = [];
          for (let i in registry._elements) {
            if (registry._elements[i].element.type == "bpmn:StartEvent") {
              startBpmnEvents.push(registry._elements[i].element.businessObject);
            }
          }

          if (!!startBpmnEvents) {
            let petriNet = {};
            let maxPlaceNumberObj = { maxPlaceNumber: 0 };
            // For multiple lanes we have multiple start events
            for (let i = 0; i < startBpmnEvents.length; i++) {
              petriNet = PetriNets.buildPetriNet(registry, startBpmnEvents[i], petriNet, maxPlaceNumberObj, self.taskDtoOrdering);
            }

            PetriNets.preparePetriNetForServer(petriNet);

            let matcher = {};
            Object.keys(petriNet).forEach(k => {
              petriNet[k]["id"] = k;

              let obj = registry.get(k);
              if (!!obj && obj.businessObject.sqlScript) {
                matcher[k] = obj.businessObject.sqlScript;
              }
            });
            let petriNetArray = Object.values(petriNet);
            PetriNets.removePetriMarks(registry);

            let serverPetriFileName = self.file.id + "_" + self.file.title.substring(0, self.file.title.length - 5);
            let participants = PolicyHelper.groupPoliciesByParticipants(registry);

            $('#messageModal').modal('show');
            LeaksWhenRequests.sendPreparationRequest(self.http, serverPetriFileName, JSON.stringify(petriNetArray), matcher, (outputTarget ? [outputTarget] : self.selectedDataObjects), self.taskDtoOrdering, participants, simplificationTarget, serverResponsePromises)
              .then(res => $('#messageModal').modal('hide'),
                err => {
                  $('#messageModal').modal('hide');
                  $('#leaksWhenServerError').show();
                });
          }
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
          this.http.post(config.backend.host + '/rest/sql-privacy/analyze-leaks-when', { model: xml }, this.authService.loadRequestOptions()).subscribe(
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