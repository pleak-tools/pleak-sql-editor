import { Component} from '@angular/core';
import { AuthComponent } from 'app/auth/auth.component';
import { Microcode } from "app/microcode/microcode";
import { SqlBPMNModdle } from "./bpmn-sql-extension";
import { analizeSQLDFlow } from "app/analyser/SQLDFlowAnalizer";
import { computeGraMSecMatrices } from "app/analyser/GraMSecAnalizer";
import * as Viewer from 'bpmn-js/lib/Viewer.js';

declare var $: any;
declare function require(name:string);

let is = (element, type) => element.$instanceOf(type);

var bpmn = require("bpmn-js");
var request = require('superagent');
var config = require('./../../config.json');
var domain = config.frontend.host;
var backend = config.backend.host;
var authComponent = new AuthComponent();

@Component({
  selector: 'editor-component',
  templateUrl: '/editor.component.html',
  styleUrls: ['/editor.component.less']
})
export class EditorComponent {

  private viewer;

  private modelId = window.location.pathname.split('/')[2];

  private saveFailed = false;
  private lastContent = '';

  private fileId = null;
  private file;

  // Load model
  getModel() {
    var that = this;
    request.get(backend + '/rest/directories/files/' + that.modelId)
      .set('JSON-Web-Token', authComponent.getToken())
      .end(function(err, res) {
        if (!err) {
          $('.buttons').show();
          $('#login-container').hide();

          that.file = res.body;
          that.fileId = that.file.id;
          if (that.file.content.length === 0) {
            console.log("File can't be found or opened!");
          }
          that.openDiagram(that.file.content);
          that.lastContent = that.file.content;
          document.title += ' - ' + that.file.title;
        }
      });
  }

  // Load diagram and add editor to its components
  openDiagram(diagram) {

    var that = this;

    this.viewer = new Viewer({
      container: '#canvas',
      keyboard: {
        bindTo: document 
      },
      moddleExtensions: {
        sqlExt: SqlBPMNModdle
      }
    });

    this.viewer.importXML(diagram, (error, definitions) => {
      
      var eventBus = this.viewer.get('eventBus');
      var overlays = this.viewer.get('overlays');

      eventBus.on('element.click', function(e) {

        if (is(e.element.businessObject, 'bpmn:DataObjectReference') || is(e.element.businessObject, 'bpmn:Task')) {

          let task = e.element.businessObject;
          var sqlQuery;
          if (task.sqlScript == null) {
            sqlQuery = "";
          } else {
            sqlQuery = task.sqlScript;
          }

          var overlayHtml = $(
            `<div class="editor" id="` + e.element.id + `-sql-editor">
               <div class="editor-body">
                 <textarea class="code-input">` + sqlQuery + `</textarea>
                 <pre class="code-output">
                   <code class="language-sql"></code>
                 </pre>
               </div>
               <br>
               <button id="` + e.element.id + `-save-button">Save</button>
             </div>`
          );
          
          overlays.add(e.element, {
            position: {
              bottom: 0,
              right: 0
            },
            html: overlayHtml
          });

          $(overlayHtml).on('click', '#' + e.element.id+'-save-button', function(e) {
					  task.sqlScript = $(overlayHtml).find('.code-input').val();
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

    $('#save-diagram').click( function(e) {
      e.preventDefault();
      e.stopPropagation();
      that.save();
    });

    $('#analyse-diagram').click( function(e) {
      e.preventDefault();
      e.stopPropagation();
      that.analyse();
    });

  }

  // Save model
  save() {
    var that = this;

    this.viewer.saveXML({format: true},
      (err: any, xml: string) => {
        if (err) {
          console.log(err)
        } else {
          that.file.content = xml;
          request
            .put(backend + '/rest/directories/files/' + that.fileId)
            .set('JSON-Web-Token', authComponent.getToken())
            .send(that.file)
            .end(function(err, res) {
              if (res.statusCode === 200 || res.statusCode === 201) {
                $('#fileSaveSuccess').show();
                $('#fileSaveSuccess').fadeOut(5000);
                var date = new Date();
                localStorage.setItem("lastModifiedFileId", '"' + res.body.id + '"');
                localStorage.setItem("lastModified", '"' + date.getTime() + '"');
                if (that.fileId !== res.body.id) {
                  window.location.href = domain + '/modeler/' + res.body.id;
                }
                that.file.md5Hash = res.body.md5Hash;
                that.lastContent = that.file.content;
                that.fileId = res.body.id;
                that.saveFailed = false;
              } else if (res.statusCode === 401) {
                that.saveFailed = true;
                $('#loginModal').modal();
              }
            });
          console.log(xml)
        }
      });

  }

  // Analyse model
  analyse() {
    var that = this;
    this.viewer.saveXML({format: true}, (err: any, xml: string) => {
      this.viewer.get("moddle").fromXML(xml, (err:any, definitions:any) => {
        this.viewer.importDefinitions(definitions, () => this.postLoad(definitions));
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

  processBPMNProcess(element:any) {
    let registry = this.viewer.get('elementRegistry');
    let canvas = this.viewer.get('canvas');
    let eventBus = this.viewer.get('eventBus');
    let overlays = this.viewer.get('overlays');
    analizeSQLDFlow(element, registry, canvas, overlays, eventBus);
  }

}