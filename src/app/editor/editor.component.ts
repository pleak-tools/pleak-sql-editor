import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { Http } from '@angular/http';
import { AuthService } from "../auth/auth.service";
import { SqlBPMNModdle } from "./bpmn-sql-extension";
import { Analyser } from "../analyser/SQLDFlowAnalizer";
import { topologicalSorting, dataFlowAnalysis } from "../analyser/GraMSecAnalizer";
import * as Viewer from 'bpmn-js/lib/NavigatedViewer';
import { SidebarComponent } from '../sidebar/sidebar.component';

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
    this.authService.authStatus.subscribe(status => {
      this.authenticated = status;
      if (!status || !this.file) {
        this.getModel();
      }
    });
    this.getModel();
  }

  @Input() authenticated: Boolean;
  @ViewChild(SidebarComponent) sidebarComponent: SidebarComponent

  private viewer: Viewer;
  private modelId: Number = Number.parseInt(window.location.pathname.split('/')[2]);
  private saveFailed: Boolean = false;
  private lastContent: String = '';
  private codeMirror: any;
  private fileId: Number = null;
  private file: any;
  private lastModified: Number = null;
  private selectedDataObjects: Array<string> = [];

  isAuthenticated() {
    return this.authenticated;
  }

  // Load model
  getModel() {
    var self = this;
    $('#canvas').html('');
    $('.buttons-container').off('click', '#save-diagram');
    $('.buttons-container').off('click', '#analyse-diagram');
    self.viewer = null;
    this.http.get(config.backend.host + '/rest/directories/files/' + self.modelId, this.authService.loadRequestOptions()).subscribe(
      success => {
        self.file = JSON.parse((<any>success)._body);
        self.fileId = self.file.id;
        if (self.file.content.length === 0) {
          console.log("File can't be found or opened!");
        }
        self.openDiagram(self.file.content);
        self.lastContent = self.file.content;
        document.title = 'Pleak SQL-privacy editor - ' + self.file.title;
        $('#fileName').text(this.file.title);
        self.lastModified = new Date().getTime();
      },
      fail => {
        self.fileId = null;
        self.file = null;
        self.lastContent = '';
        self.saveFailed = false;
      }
    );
  }

  // Load diagram and add editor
  openDiagram(diagram: String) {
    var self = this;
    if (diagram && this.viewer == null) {
      this.viewer = new Viewer({
        container: '#canvas',
        keyboard: {
          bindTo: document
        },
        moddleExtensions: {
          sqlExt: SqlBPMNModdle
        }
      });

      this.viewer.importXML(diagram, () => {
        let eventBus = this.viewer.get('eventBus');
        let overlays = this.viewer.get('overlays');

        eventBus.on('element.click', function (e) {
          // User can select intermediate and sync data objects for leaks report
          if (is(e.element.businessObject, 'bpmn:DataObjectReference') && !!e.element.incoming.length) {
            // let canvas = self.viewer.get('canvas');
            // if (!e.element.businessObject.selectedForReport) {
            //   self.selectedDataObjects.push(e.element.businessObject.name);
            //   e.element.businessObject.selectedForReport = true;
            //   canvas.addMarker(e.element.id, 'highlight-input-selected');
            // }
            // else {
            //   let index = self.selectedDataObjects.findIndex(x => x == e.element.businessObject.name);
            //   self.selectedDataObjects.splice(index, 1);
            //   e.element.businessObject.selectedForReport = false;
            //   canvas.removeMarker(e.element.id, 'highlight-input-selected');
            // }
          }
          else {
            if ((is(e.element.businessObject, 'bpmn:DataObjectReference') ||
              is(e.element.businessObject, 'bpmn:Task')) && !$(document).find("[data-element-id='" + e.element.id + "']").hasClass('highlight-input')) {

              let task = e.element.businessObject;
              let sqlQuery;
              if (task.sqlScript == null) {
                sqlQuery = "";
              } else {
                sqlQuery = task.sqlScript;
              }

              $('#SaveEditing').on('click', function () {
                task.sqlScript = self.codeMirror.getValue();
                self.updateModelContentVariable();
                self.sidebarComponent.isEditing = false;
                $('#SaveEditing').off('click');
              });

              $(document).mouseup(function (ee) {
                var container = $('#canvas');
                if (container && container.has(ee.target).length) {
                  self.sidebarComponent.isEditing = false;
                  $('#SaveEditing').off('click');
                }
              });

              self.sidebarComponent.isEditing = true;

              $('textarea#CodeEditor').val(sqlQuery);
              self.codeMirror.setValue(sqlQuery);
              setTimeout(function () {
                self.codeMirror.refresh();
              }, 10);
            }
            else {
              overlays.remove({ element: e.element });
            }
          }
        });
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
        this.sidebarComponent.clear();
        this.buildSqlInTopologicalOrder();
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
        if (this.file.content != this.lastContent) {
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
            console.log(err)
          } else {
            self.file.content = xml;
            this.http.put(config.backend.host + '/rest/directories/files/' + self.fileId, self.file, this.authService.loadRequestOptions()).subscribe(
              success => {
                // console.log(success)
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
                  self.saveFailed = false;
                } else if (success.status === 401) {
                  self.saveFailed = true;
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
    this.viewer.saveXML({ format: true }, (err: any, xml: string) => {
      this.viewer.get("moddle").fromXML(xml, (err: any, definitions: any) => {
        if (typeof definitions !== 'undefined') {
          this.viewer.importDefinitions(definitions, () => this.postLoad(definitions));
        }
      });
    });
  }

  postLoad(definitions: any) {
    for (let diagram of definitions.diagrams) {
      var element = diagram.plane.bpmnElement;
      if (element.$type === "bpmn:Process") {
        this.processBPMNProcess(element);
      } else {
        for (let participant of element.participants)
          this.processBPMNProcess(participant.processRef);
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
          $('#save-diagram').addClass('active');
        }
      }
    );
  }

  buildSqlInTopologicalOrder() {
    let self = this;
    this.viewer.saveXML({ format: true }, (err: any, xml: string) => {
      this.viewer.get("moddle").fromXML(xml, (err: any, definitions: any) => {
        var element = definitions.diagrams[0].plane.bpmnElement;
        let registry = this.viewer.get('elementRegistry');
        let info = dataFlowAnalysis(element, registry);
        let [processingNodes, dataFlowEdges, invDataFlowEdges, sources] = [info.processingNodes, info.dataFlowEdges, info.invDataFlowEdges, info.sources];
        let order = topologicalSorting(dataFlowEdges, invDataFlowEdges, sources);

        let sqlCommands = order.reduce(function (sqlCommands, id) {
          let obj = registry.get(id);
          if (obj.type == "bpmn:DataObjectReference" && !obj.incoming.length ||
            obj.type == "bpmn:Task") {
            let sql = obj.businessObject.sqlScript;
            sqlCommands += sql + '\n\n';
          }
          return sqlCommands;
        }, "");
        console.log(sqlCommands);

        let processedLabels = self.selectedDataObjects.map(x => x.split(" ").map(word => word.toLowerCase()).join("_"));
        console.log(processedLabels);
      });
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
    this.codeMirror = CodeMirror.fromTextArea(document.getElementById("CodeEditor"), {
      mode: "text/x-mysql",
      lineNumbers: true,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    this.codeMirror.setSize("100%", 220);

    Analyser.onAnalysisCompleted.subscribe(result => {
      this.sidebarComponent.emitTaskResult(result);
    });
  }
}