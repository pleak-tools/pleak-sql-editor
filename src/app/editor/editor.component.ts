import { Component, OnInit, Input } from '@angular/core';
import { Http } from '@angular/http';
import { AuthService } from "app/auth/auth.service";
import { Microcode } from "app/microcode/microcode";
import { SqlBPMNModdle } from "./bpmn-sql-extension";
import { analizeSQLDFlow } from "app/analyser/SQLDFlowAnalizer";
import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

declare var $: any;
declare function require(name:string);

let is = (element, type) => element.$instanceOf(type);

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
      this.getModel();
    });
  }

  @Input() authenticated: Boolean;

  private viewer: Viewer;

  private modelId: Number = Number.parseInt(window.location.pathname.split('/')[2]);

  private saveFailed: Boolean = false;
  private lastContent: String = '';

  private fileId: Number = null;
  private file: any;

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

        eventBus.on('element.click', function(e) {

          if ((is(e.element.businessObject, 'bpmn:DataObjectReference') || is(e.element.businessObject, 'bpmn:Task')) && !$(document).find("[data-element-id='" + e.element.id + "']").hasClass('highlight-input')) {

            let task = e.element.businessObject;
            let sqlQuery;
            if (task.sqlScript == null) {
              sqlQuery = "";
            } else {
              sqlQuery = task.sqlScript;
            }

            let overlayHtml = $(
              `<div class="editor" id="` + e.element.id + `-sql-editor">
                 <div class="editor-body">
                   <textarea class="code-input">` + sqlQuery + `</textarea>
                   <pre class="code-output">
                     <code class="language-sql"></code>
                   </pre>
                 </div>
                 <br>
                 <button class="btn btn-success" id="` + e.element.id + `-save-button">Save</button>
               </div>`
            );
          
            overlays.add(e.element, {
              position: {
                bottom: 0,
                right: 0
              },
              html: overlayHtml
            });

            $(overlayHtml).on('click', '#' + e.element.id+'-save-button', function() {
              task.sqlScript = $(overlayHtml).find('.code-input').val();
              self.updateModelContentVariable();
              $('#' + e.element.id + '-sql-editor').hide();
            });

            $(document).mouseup(function(ee) {
              var container = $('.editor');
              if (!container.is(ee.target) && container.has(ee.target).length === 0) {
                overlays.remove({element: e.element});
              }
            });

            var editor = new Microcode($(overlayHtml).find('.code-input'), $(overlayHtml).find('.code-output'));

          } else {

            overlays.remove({element: e.element});

          }

        });

      });

      $('.buttons-container').on('click', '#save-diagram', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.save();
      });

      $('.buttons-container').on('click', '#analyse-diagram', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.analyse();
      });

      $(window).on('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
          switch (String.fromCharCode(e.which).toLowerCase()) {
            case 's':
              event.preventDefault();
              this.save();
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
              console.log(success)
              if (success.status === 200 || success.status === 201) {
                var data = JSON.parse((<any>success)._body);
                $('#fileSaveSuccess').show();
                $('#fileSaveSuccess').fadeOut(5000);
                var date = new Date();
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
          console.log(xml)
        }
      });
  }

  // Analyse model
  analyse() {
    this.viewer.saveXML({format: true}, (err: any, xml: string) => {
      this.viewer.get("moddle").fromXML(xml, (err:any, definitions:any) => {
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
    analizeSQLDFlow(element, registry, canvas, overlays, eventBus, this.http, this.authService);
  }

  updateModelContentVariable() {
    this.viewer.saveXML(
      {
        format: true
      },
      (err: any, xml: string) => {
        if (xml) {
          this.file.content = xml;
        }
      }
    );
  }

  ngOnInit() {
    window.addEventListener('storage', (e) => {
      if (e.storageArea === localStorage) {
        this.authService.verifyToken();
        this.getModel();
      }
    });
  }

}