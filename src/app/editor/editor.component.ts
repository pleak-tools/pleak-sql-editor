import { Component, OnInit, Input, ViewChild, EventEmitter, Output } from '@angular/core';
import {HttpClient, HttpResponse} from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { SqlBPMNModdle } from './bpmn-labels-extension';
import { Analyser } from '../analyser/SQLDFlowAnalizer';
import { PetriNets } from '../analyser/PetriNets';
import { LeaksWhenRequests } from './leaks-when-requests';
import { PolicyHelper } from './policy-helper';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { GAPanelComponent } from '../ga-panel/ga-panel.component';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { ElementsHandler } from './elements-handler';
import { SimpleDisclosureAnalysis } from './simple-analysis';

declare var $: any;
declare var CodeMirror: any;
declare function require(name: string);

const is = (element, type) => element.$instanceOf(type);

const pg_parser = require('exports-loader?Module!pgparser/pg_query.js');
pg_parser.parse('');

const config = require('./../../config.json');

@Component({
  selector: 'app-sql-privacy-editor',
  templateUrl: 'editor.component.html',
  styleUrls: ['editor.component.less']
})
export class EditorComponent implements OnInit {
  @Output() editSqlTable: EventEmitter<any> = new EventEmitter();

  constructor(public http: HttpClient, private authService: AuthService) {
    const pathname = window.location.pathname.split('/');
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
  @ViewChild(SidebarComponent, { static: true }) sidebarComponent: SidebarComponent;
  @ViewChild(GAPanelComponent, { static: true }) gaPanelComponent: GAPanelComponent;
  // @ViewChild(ElementsHandler, { static: false }) elementsHandler: ElementsHandler;
  public elementsHandler;
  private loaded = false;

  private viewer: NavigatedViewer;
  private eventBus;
  private overlays;
  private canvas;

  modelId;
  viewerType;
  private menuSelector;

  private lastContent: String = '';
  private codeMirror: any;
  private fileId: Number = null;
  public static file: any;
  private lastModified: Number = null;
  private selectedDataObjects: Array<any> = [];
  private taskDtoOrdering = {};

  private roles: Array<any> = [];

  isAuthenticated() {
    return this.authenticated;
  }

  // Load model
  getModel() {
    const self = this;
    $('#canvas').html('');
    $('.buttons-container').off('click', '#save-diagram');
    $('.buttons-container').off('click', '#analyse-diagram');
    self.viewer = null;
    this.http.get(config.backend.host + '/rest/directories/files/' + (this.viewerType === 'public' ? 'public/' : '') + this.modelId, AuthService.loadRequestOptions()).subscribe(
      success => {
        EditorComponent.file = success;
        self.fileId = EditorComponent.file.id;
        if (EditorComponent.file.content.length === 0) {
          alert('File can\'t be found or opened!');
        }
        if (this.viewerType === 'public' && this.isAuthenticated()) {
          self.getPermissions();
        } else {
          self.initCodemirror();
          self.openDiagram(EditorComponent.file.content);
        }
        self.lastContent = EditorComponent.file.content;
        document.title = 'Pleak SQL-privacy editor - ' + EditorComponent.file.title;
        $('#fileName').text(EditorComponent.file.title);
        self.lastModified = new Date().getTime();
      },
      fail => {
        self.fileId = null;
        EditorComponent.file = null;
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
    this.http.get(config.backend.host + '/rest/directories/files/' + this.fileId, AuthService.loadRequestOptions()).subscribe(
        (response: any) => {
          EditorComponent.file.permissions = response.permissions;
          EditorComponent.file.user = response.user;
          EditorComponent.file.md5Hash = response.md5Hash;
        },
      () => { },
      () => {
        this.initCodemirror();
        this.openDiagram(EditorComponent.file.content);
      }
    );
  }

  canEdit() {
    const file = EditorComponent.file;

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
    if (!e.type) {
      e.element.sqlScript = this.codeMirror.getValue();
    } else {
      e.element.policyScript = this.codeMirror.getValue();
    }

    this.updateModelContentVariable();
    this.sidebarComponent.isEditing = false;
    this.sidebarComponent.elementBeingEdited = null;
    this.sidebarComponent.elementOldValue = '';

    if (e.element && e.element.id) {
      this.canvas.removeMarker(e.element.id, 'selected');
    }
  }

  // Load diagram and add editor
  openDiagram(diagram: String) {
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
        this.sidebarComponent.init(this.canvas, this.codeMirror);
      }, 100);

      this.sidebarComponent.save.subscribe(({ element, type }) => this.saveSQLScript({ element, type }));
      this.elementsHandler = new ElementsHandler(this.http, this.viewer, diagram, pg_parser, this, this.canEdit());

      this.viewer.importXML(diagram, () => {
        this.canvas.zoom('fit-viewport','auto');
        this.viewer.get('moddle').fromXML(diagram, (_err: any, definitions: any) => {
          if (typeof definitions !== 'undefined') {
            this.viewer.importDefinitions(definitions, () => this.elementsHandler.createElementHandlerInstances(definitions));
          }
        });

        this.eventBus.on('element.click', (e) => {
          // User can select intermediate and sync data objects for leaks report
          if (is(e.element.businessObject, 'bpmn:DataObjectReference') || is(e.element.businessObject, 'bpmn:Participant')) {
            if (e.element.incoming && e.element.incoming.length || is(e.element.businessObject, 'bpmn:Participant')) {
              this.showMenu(e);
            } else {
              this.elementsHandler.click(e.element);
            }
          } else {
            if (this.menuSelector) {
              this.overlays.remove({ id: this.menuSelector });
              this.menuSelector = null;
            }

            if ((is(e.element.businessObject, 'bpmn:Task') || is(e.element.businessObject, 'bpmn:StartEvent') || is(e.element.businessObject, 'bpmn:IntermediateCatchEvent')) && !$(document).find('[data-element-id=\'' + e.element.id + '\']').hasClass('highlight-input')) {
              const selectedElement = e.element.businessObject;
              if (this.sidebarComponent.elementBeingEdited !== null && this.sidebarComponent.elementBeingEdited === selectedElement.id && this.sidebarComponent.elementOldValue !== this.codeMirror.getValue()) {
                this.canvas.addMarker(this.sidebarComponent.elementBeingEdited, 'selected');
                return false;
              } else if (this.sidebarComponent.elementBeingEdited !== null && this.sidebarComponent.elementBeingEdited !== selectedElement.id && this.sidebarComponent.elementOldValue !== this.codeMirror.getValue()) {
                if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
                  this.sidebarComponent.loadSQLScript(selectedElement, 0);
                } else {
                  this.canvas.addMarker(this.sidebarComponent.elementBeingEdited, 'selected');
                  this.canvas.removeMarker(e.element.id, 'selected');
                  return false;
                }
              } else {
                this.sidebarComponent.loadSQLScript(selectedElement, 0);
              }
            } else {
              this.overlays.remove({ element: e.element });
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

      $('.buttons-container').on('click', '#propagate-diagram', (e) => {
        e.preventDefault();
        // e.stopPropagation();

        let analysisHtml = `<div class="spinner">
            <div class="double-bounce1"></div>
            <div class="double-bounce2"></div>
          </div>`;
        $('#messageModal').find('.modal-title').text("Propagation in progress...");
        $('#messageModal').find('.modal-body').html(analysisHtml);
        $('#messageModal').modal('show');
        $('#leaksWhenInputError').hide();

        let reg = this.viewer.get('elementRegistry');
        GAPanelComponent.runPropagationAnalysis(reg, this.http, (output) => {

          for (var i in reg._elements) {
            var node = reg._elements[i].element;

            if (node.type == "bpmn:DataObjectReference") {
              for(var tab in output.tableSchemas){
                if(tab == node.businessObject.id) {
                  node.businessObject.sqlScript = output.tableSchemas[tab];
                  node.businessObject.tableData = output.tableDatas[tab];
                  node.businessObject.isPropagated = true;
                }
              }
              // if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
              //   // let isGAInputFound = false;
              // }
            }
          }

          setTimeout(() => $('#messageModal').modal('hide'), 250);
          this.updateModelContentVariable();
          // this.updateDataObjectOptions();
          // this.setNewModelContentVariableContent();
        });
        // this.sidebarComponent.clear();
        // this.analyse();
      });

      $('.buttons-container').on('click', '#leaks-report', (e) => {
        e.preventDefault();
        // e.stopPropagation();
        $('#leaksWhenInputError').hide();
        $('#leaksWhenServerError').hide();
        this.sidebarComponent.clear();
        this.runLeaksWhenAnalysis();
      });

      $('.buttons-container').on('click', '#ga-analysis', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const registry = this.viewer.get('elementRegistry');
        const gaInputs = PolicyHelper.getParticipantsInfoForGA(registry);
        this.gaPanelComponent.init(gaInputs, registry, this.canvas);
      });

      $('.buttons-container').on('click', '#sd-analysis', (e) => {
        e.preventDefault();
        // e.stopPropagation();

        const analysisHtml = `<div class="spinner">
            <div class="double-bounce1"></div>
            <div class="double-bounce2"></div>
          </div>`;
        $('#messageModal').find('.modal-title').text('Analysis in progress...');
        $('#messageModal').find('.modal-body').html(analysisHtml);
        $('#messageModal').modal('show');
        $('#leaksWhenInputError').hide();

        const registry = this.viewer.get('elementRegistry');
        this.loadExtendedSimpleDisclosureData().then(() => {
          const esd = localStorage.getItem('esdInfo');
          SimpleDisclosureAnalysis.showPopup(registry, esd);
          $('#messageModal').modal('hide');
          $(document).off('click', '#simpleLeaksWhen');
          $(document).on('click', '#simpleLeaksWhen', () => {
            if (SimpleDisclosureAnalysis.SelectedTarget.simplificationDto) {
              const processedTarget = SimpleDisclosureAnalysis.SelectedTarget.simplificationDto.name.split(' ').map(word => word.toLowerCase()).join('_');
              this.canvas.addMarker(SimpleDisclosureAnalysis.SelectedTarget.simplificationDto.id, 'highlight-group');
              this.runLeaksWhenAnalysis(processedTarget, SimpleDisclosureAnalysis.SelectedTarget.selectedTargetForLeaksWhen);
            } else {
              $('#leaksWhenInputError').show();
            }
          });
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

  loadExtendedSimpleDisclosureData(): any {
    return new Promise((resolve) => {
      localStorage.setItem('esdInfo', '');
      localStorage.setItem('esdInfoStatus', '');
      $('#pe-bpmn-import-iframe').attr('src', config.frontend.host + '/pe-bpmn-editor/export/' + this.fileId + '/esd'); // "esd" as extended simple disclosure
      $('#pe-bpmn-import-iframe').off('load').on('load', () => {
        const poller = setInterval(() => {
          if (localStorage.getItem('esdInfo') && localStorage.getItem('esdInfoStatus') && localStorage.getItem('esdInfoStatus').length > 0) {
            clearInterval(poller);
            resolve();
          }
        }, 100);
      });
    });
  }

  showMenu(e) {
    const element = e.element;
    const self = this;
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
            ` + (!is(e.element.businessObject, 'bpmn:Participant')
        ? `<tr>
                  <td class="link-row" id="select-button" style="cursor: pointer">` + (element.businessObject.selectedForReport ? 'Deselect' : 'Select') + `</td>
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
    const registry = this.viewer.get('elementRegistry');

    if (self.menuSelector) {
      self.overlays.remove({ id: self.menuSelector });
    }

    $(overlayHtml).on('click', '.stereotype-editor-close-link', () => {
      self.overlays.remove({ id: self.menuSelector });
      self.menuSelector = null;
    });

    $(overlayHtml).on('click', '#select-button', () => {
      if (!element.businessObject.selectedForReport) {
        self.selectedDataObjects.push(element.businessObject);
        element.businessObject.selectedForReport = true;
        self.canvas.addMarker(element.id, 'highlight-input-selected');
        $('#select-button').text('Deselect');
      } else {
        const index = self.selectedDataObjects.findIndex(x => x === element.businessObject);
        self.selectedDataObjects.splice(index, 1);
        element.businessObject.selectedForReport = false;
        self.canvas.removeMarker(element.id, 'highlight-input-selected');
        $('#select-button').text('Select');
      }
      self.overlays.remove({ id: self.menuSelector });
      self.menuSelector = null;
    });

    $(overlayHtml).on('click', '#policy-button', () => {
      this.sidebarComponent.clear();
      self.roles = PolicyHelper.extractRoles(registry);
      self.sidebarComponent.loadSQLScript(element.businessObject, 1, self.roles);
      self.overlays.remove({ id: self.menuSelector });
    });

    $(overlayHtml).on('click', '#sql-script-button', () => {
      this.sidebarComponent.clear();
      self.overlays.remove({ id: self.menuSelector });
      self.elementsHandler.click(element);
    });

    const overlayPosition = !is(element.businessObject, 'bpmn:Participant')
      ? { right: 0, bottom: 0 }
      // : {top: e.originalEvent.clientX - element.x, left: e.originalEvent.clientY - element.y};
      : { top: 5, left: 40 };

    const menuOverlay = this.overlays.add(registry.get(element.businessObject.id), {
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
    const self = this;
    if ($('#save-diagram').is('.active')) {
      this.viewer.saveXML(
        {
          format: true
        },
        (err: any, xml: string) => {
          if (err) {
            console.log(err);
          } else {
            EditorComponent.file.content = xml;
            this.http.put(config.backend.host + '/rest/directories/files/' + self.fileId, EditorComponent.file, AuthService.loadRequestOptions({observe: 'response'})).subscribe(
              (response: HttpResponse<any>) => {
                if (response.status === 200 || response.status === 201) {
                  const data = response.body;
                  $('#fileSaveSuccess').show();
                  $('#fileSaveSuccess').fadeOut(5000);
                  $('#save-diagram').removeClass('active');
                  const date = new Date();
                  self.lastModified = date.getTime();
                  localStorage.setItem('lastModifiedFileId', '"' + data.id + '"');
                  localStorage.setItem('lastModified', '"' + date.getTime() + '"');
                  if (self.fileId !== data.id) {
                    window.location.href = config.frontend.host + '/modeler/' + data.id;
                  }
                  EditorComponent.file.md5Hash = data.md5Hash;
                  self.lastContent = EditorComponent.file.content;
                  self.fileId = data.id;
                } else if (response.status === 401) {
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
    $('#messageModal').find('.modal-title').text('Analysis in progress...');
    this.selectedDataObjects = [];
    this.viewer.saveXML({ format: true }, (err1: any, xml: string) => {
      this.viewer.get('moddle').fromXML(xml, (err2: any, definitions: any) => {
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

    $modal.find('.modal-title').text('BPMN LeaksWhen Report');

    $modal.find('table thead').html(function () {
      let output = `<th></th>`;

      response.inputs.forEach(function (item) {
        output += `<th><div><span>${item}</span></div></th>`;
      });

      return `<tr>${output}</tr>`;
    });

    $modal.find('table tbody').html(function () {
      let output = '';

      response.outputs.forEach(function (item) {
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

      const moveFunction = function (e) {
        const diffX = e.pageX - startX;
        const diffY = e.pageY - startY;

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
    for (const diagram of definitions.diagrams) {
      const element = diagram.plane.bpmnElement;
      if (element.$type === 'bpmn:Process') {
        this.processBPMNProcess(element);
      } else {
        for (const participant of element.participants) {
          if (participant.processRef) {
            this.processBPMNProcess(participant.processRef);
          }
        }
      }
    }
  }

  processBPMNProcess(element: any) {
    const registry = this.viewer.get('elementRegistry');
    const canvas = this.viewer.get('canvas');
    const eventBus = this.viewer.get('eventBus');
    const overlays = this.viewer.get('overlays');

    Analyser.analizeSQLDFlow(element, registry, canvas, overlays, eventBus, this.http);
  }

  updateModelContentVariable() {
    this.viewer.saveXML(
      {
        format: true
      },
      (err: any, xml: string) => {
        if (xml) {
          EditorComponent.file.content = xml;
          if (EditorComponent.file.content !== this.lastContent) {
            $('#save-diagram').addClass('active');
          }
        }
      }
    );
  }

  runLeaksWhenAnalysis(simplificationTarget = null, outputTarget = null) {
    const self = this;
    if (!self.selectedDataObjects.length && !outputTarget) {
      $('#leaksWhenInputError').show();
    } else {
      this.viewer.saveXML({ format: true }, (err: any, xml: string) => {
        this.viewer.get('moddle').fromXML(xml, () => {
          const registry = this.viewer.get('elementRegistry');

          // Displaying the spinner during analysis
          const analysisHtml = `<div class="spinner">
                <div class="double-bounce1"></div>
                <div class="double-bounce2"></div>
              </div>`;
          $('#messageModal').find('.modal-title').text('Analysis in progress...');
          $('#messageModal').find('.modal-body').html(analysisHtml);

          // Promise chain for async requests
          const serverResponsePromises = [];

          const startBpmnEvents = [];
          for (const i in registry._elements) {
            if (registry._elements[i].element.type === 'bpmn:StartEvent') {
              startBpmnEvents.push(registry._elements[i].element.businessObject);
            }
          }

          if (!!startBpmnEvents) {
            let petriNet = {};
            const maxPlaceNumberObj = { maxPlaceNumber: 0 };
            // For multiple lanes we have multiple start events
            for (let i = 0; i < startBpmnEvents.length; i++) {
              petriNet = PetriNets.buildPetriNet(registry, startBpmnEvents[i], petriNet, maxPlaceNumberObj, self.taskDtoOrdering);
            }

            PetriNets.preparePetriNetForServer(petriNet);

            const matcher = {};
            Object.keys(petriNet).forEach(k => {
              petriNet[k]['id'] = k;

              const obj = registry.get(k);
              if (!!obj && obj.businessObject.sqlScript) {
                matcher[k] = obj.businessObject.sqlScript;
              }
            });
            const petriNetArray = Object.values(petriNet);
            PetriNets.removePetriMarks(registry);

            const serverPetriFileName = EditorComponent.file.id + '_' + EditorComponent.file.title.substring(0, EditorComponent.file.title.length - 5);
            const participants = PolicyHelper.groupPoliciesByParticipants(registry);

            $('#messageModal').modal('show');
            LeaksWhenRequests.sendPreparationRequest(self.http, serverPetriFileName, JSON.stringify(petriNetArray), matcher, (outputTarget ? [outputTarget] : self.selectedDataObjects), self.taskDtoOrdering, participants, simplificationTarget, serverResponsePromises)
              .then(res => $('#messageModal').modal('hide'),
                () => {
                  $('#messageModal').modal('hide');
                  $('#leaksWhenServerError').show();
                });
          }
        });
      });
    }
  }

  sendBpmnLeaksWhenRequest() {
    const analysisHtml = `
      <div class="spinner">
        <div class="double-bounce1"></div>
        <div class="double-bounce2"></div>
      </div>`;
    $('#bpmnLeaksWhenModal').find('.modal-title').text('Analysis in progress...');
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
          this.http.post(config.backend.host + '/rest/sql-privacy/analyze-leaks-when', { model: xml }, AuthService.loadRequestOptions()).subscribe(
            (response: any) => {
              this.bpmnLeaksWhen(JSON.parse(response.result));
            },
            () => {
              console.log('analysis failed');
              $('#bpmnLeaksWhenModal').modal('toggle');
            }
          );
        }
      });
  }

  dropdownList = [];
  selectedItems = [];
  dropdownSettings = {};

  ngOnInit() {
    this.dropdownList = [
      {"id":1,"itemName":"India"},
      {"id":2,"itemName":"Singapore"},
      {"id":3,"itemName":"Australia"},
      {"id":4,"itemName":"Canada"},
      {"id":5,"itemName":"South Korea"},
      {"id":6,"itemName":"Germany"},
      {"id":7,"itemName":"France"},
      {"id":8,"itemName":"Russia"},
      {"id":9,"itemName":"Italy"},
      {"id":10,"itemName":"Sweden"}
    ];
    this.selectedItems = [
            {"id":2,"itemName":"Singapore"},
            {"id":3,"itemName":"Australia"},
            {"id":4,"itemName":"Canada"},
            {"id":5,"itemName":"South Korea"}
    ];
    this.dropdownSettings = {
              singleSelection: false, 
              text:"Select Countries",
              selectAllText:'Select All',
              unSelectAllText:'UnSelect All',
              enableSearchFilter: true,
              classes:"myclass custom-class"
    };

    window.addEventListener('storage', (e) => {
      if (e.storageArea === localStorage) {
        if (!this.authService.verifyToken()) {
          this.getModel();
        } else {
          if (localStorage.getItem('lastModifiedFileId') && localStorage.getItem('lastModified')) {
            const lastModifiedFileId = Number(localStorage.getItem('lastModifiedFileId').replace(/['"]+/g, ''));
            let currentFileId = null;
            if (EditorComponent.file) {
              currentFileId = EditorComponent.file.id;
            }
            const localStorageLastModifiedTime = Number(localStorage.getItem('lastModified').replace(/['"]+/g, ''));
            const lastModifiedTime = this.lastModified;
            if (lastModifiedFileId && currentFileId && localStorageLastModifiedTime && lastModifiedTime && lastModifiedFileId === currentFileId && localStorageLastModifiedTime > lastModifiedTime) {
              this.getModel();
            }
          }
        }
      }
    });

    Analyser.analysisCompleted.subscribe(result => {
      this.sidebarComponent.emitTaskResult(result);
    });

  }
}
