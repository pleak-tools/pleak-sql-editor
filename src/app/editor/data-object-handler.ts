import * as Viewer from 'bpmn-js/lib/NavigatedViewer';
import {HttpClient, HttpResponse} from '@angular/common/http';
import { ElementsHandler } from "./elements-handler";
import { LeaksWhenRequests } from './leaks-when-requests';
import { GAPanelComponent } from '../ga-panel/ga-panel.component';

declare let $: any;
declare let jexcel: any;
declare let CodeMirror: any;

declare function require(name:string);
let config = require('../../config.json');

let schemaCodeMirror;
let attackerSettingsCodeMirror;
let DBJexcel;

export class DataObjectHandler {

  constructor(public http: HttpClient, elementsHandler: ElementsHandler, dataObject: any) {
    this.viewer = elementsHandler.viewer;
    this.registry = this.viewer.get('elementRegistry');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');

    this.elementsHandler = elementsHandler;
    this.dataObject = dataObject;
  }

  beingEdited: Boolean = false;

  viewer: Viewer;
  registry: any;
  canvas: any;
  overlays: any;

  elementsHandler: ElementsHandler;
  dataObject: any;

  dataObjectOptionsPanelContainer: any;

  DBInputInitialValue: any = null;

  getDataObjectId() {
    return this.dataObject.id;
  }

  initDataObjectOptionsEditProcess() {
    this.loadDataObjectOptionsPanelTemplate();
  }

  areThereUnsavedDataObjectChanges() {
    return !!schemaCodeMirror.getValue() && this.dataObject.sqlScript != schemaCodeMirror.getValue() ||
           !!attackerSettingsCodeMirror.getValue() && this.dataObject.attackerSettings != attackerSettingsCodeMirror.getValue() ||
      this.DBInputInitialValue != null && this.DBInputInitialValue.toString() != $('#DBinputTable').jexcel('getData', false).toString();
  }

  checkForUnsavedDataObjectChangesBeforeTerminate() {
    if (this.areThereUnsavedDataObjectChanges()) {
      if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
        this.terminateDataObjectOptionsEditProcess();
      } else {
        this.canvas.addMarker(this.dataObject.id, 'selected');
        return false;
      }
    } else {
      this.terminateDataObjectOptionsEditProcess();
    }
  }

  terminateDataObjectOptionsEditProcess() {
    this.beingEdited = false;
    this.DBInputInitialValue = null;
    this.removeDataObjectHighlights();
    this.canvas.removeMarker(this.dataObject.id, 'selected');
    this.terminateDataObjectOptionsButtons();
    this.dataObjectOptionsPanelContainer.hide();
  }

  initDataObjectOptionsPanel() {
    this.beingEdited = true;
    this.dataObjectOptionsPanelContainer = $('#data-object-options-panel');

    let dataObjectName = this.dataObject.name ? this.dataObject.name : "undefined";
    this.dataObjectOptionsPanelContainer.find('.data-object-name').text(dataObjectName);

    if (!this.elementsHandler.canEdit) {
      this.dataObjectOptionsPanelContainer.find('.panel-footer').hide();
    }
    
    let inputSchema = this.dataObject.sqlScript ? this.dataObject.sqlScript : "";
    let attackerSettings = this.dataObject.attackerSettings ? this.dataObject.attackerSettings : "";
    let inputDB = this.dataObject.tableData ? JSON.parse(this.dataObject.tableData) : "";

    // Filling in data object schema
    $('.task-options-panel, .data-object-options-panel').find('.CodeMirror').remove();
    this.dataObjectOptionsPanelContainer.find('#data-object-schemaInput').val(inputSchema);
    schemaCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-schemaInput"), {
      mode: "text/x-mysql",
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    schemaCodeMirror.setSize('100%', 220);
    if (inputSchema == null) {
      inputSchema = "";
    }
    schemaCodeMirror.setValue(inputSchema);
    setTimeout(() => schemaCodeMirror.refresh(), 10);

    // Filling in attacker settings (knowledge) for the given data object
    this.dataObjectOptionsPanelContainer.find('#data-object-attacker-knowledge').val(attackerSettings);
    attackerSettingsCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-attacker-knowledge"), {
      mode: "text/x-mysql",
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: true,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    attackerSettingsCodeMirror.setSize('100%', 150);
    setTimeout(() => attackerSettingsCodeMirror.refresh(), 10);
    
    // Filling in sample data corresponding to the given data object schema
    $('.jexcel').remove();
    DBJexcel = null;
    DBJexcel = this.dataObjectOptionsPanelContainer.find('#DBinputTable');
    DBJexcel.jexcel({
      data: inputDB,
      minDimensions: [10, 7],
      editable: this.elementsHandler.canEdit,
      tableOverflow:true,
      tableHeight:'400px',
      onselection: function() {
        setTimeout(function() {
          $("#jexcel_contextmenu a:last-child").hide();
        }, 1);
      }
    });

    this.DBInputInitialValue = $('#DBinputTable').jexcel('getData', false);

    setTimeout(function() {
      schemaCodeMirror.refresh();
    }, 10);

    this.highlightDataObject();
    this.canvas.addMarker(this.dataObject.id, 'selected');

    this.initDataObjectOptionsButtons();
    let optionsPanel = this.dataObjectOptionsPanelContainer;
    optionsPanel.detach();
    $('#dto-panel').append(optionsPanel);
    $('#dto-panel').scrollTop(0);
    this.dataObjectOptionsPanelContainer.show();

  }

  loadDataObjectOptionsPanelTemplate() {
    if ($('#dto-panel').has('#data-object-options-panel').length) {
      this.initDataObjectOptionsPanel();
    } else {
      $('#dto-panel').load(config.frontend.host + '/' + config.sql_editor.folder + '/src/app/editor/templates/data-object-options-panel.html', () => {
        this.initDataObjectOptionsPanel();
      });
    }
  }

  initDataObjectOptionsButtons() {
    this.terminateDataObjectOptionsButtons();
    this.dataObjectOptionsPanelContainer.one('click', '#data-object-options-propagate-button', (e) => {
      this.propagateTables();
    });
    this.dataObjectOptionsPanelContainer.one('click', '#data-object-options-save-button', (e) => {
      this.saveDataObjectOptions();
    });
    this.dataObjectOptionsPanelContainer.on('click', '#data-object-options-hide-button', (e) => {
      this.checkForUnsavedDataObjectChangesBeforeTerminate();
    });
  }

  terminateDataObjectOptionsButtons() {
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-save-button');
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-hide-button');
  }

  updateDataObjectOptions() {
    let inputDB = $('#DBinputTable').jexcel('getData', false);

    let cleanedInputDB = [];
    for (let row of inputDB) {
      let cleanedRow = [];
      for (let cell of row) {
        if (cell.length > 0) {
          cleanedRow.push(cell.trim());
        }
      }
      if (cleanedRow.length > 0) {
        cleanedInputDB.push(cleanedRow);
      }
    }
    
    this.dataObject.sqlScript = schemaCodeMirror.getValue();
    this.dataObject.tableData = JSON.stringify(cleanedInputDB);
    this.dataObject.attackerSettings = attackerSettingsCodeMirror.getValue();
  }

  propagateTables() {
    let reg = this.registry;
    GAPanelComponent.runPropagationAnalysis(this.registry, this.http, (output) => {

      for (var i in reg._elements) {
        var node = reg._elements[i].element;
  
        if (node.type == "bpmn:DataObjectReference") {
          for(var tab in output.tableSchemas){
            if(tab == node.businessObject.id) {
              node.businessObject.sqlScript = output.tableSchemas[tab];
              node.businessObject.tableData = output.tableDatas[tab];
            }
          }
          // if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          //   // let isGAInputFound = false;
          // }
        }
      }

      this.updateDataObjectOptions();
      this.setNewModelContentVariableContent();
      this.initDataObjectOptionsPanel();
    });
    // LeaksWhenRequests.sendPropagationRequest(this.http, schemas, queries, tableDatas);
  }

  saveDataObjectOptions() {
    this.updateDataObjectOptions();
    this.terminateDataObjectOptionsEditProcess();
    this.setNewModelContentVariableContent();
  }
  
  removeDataObjectOptions() {
    this.terminateDataObjectOptionsEditProcess();
    delete this.dataObject.sqlScript;
    this.setNewModelContentVariableContent();
  }

  highlightDataObject() {
    this.canvas.addMarker(this.dataObject.id, 'highlight-data-object');
  }

  removeDataObjectHighlights() {
    this.canvas.removeMarker(this.dataObject.id, 'highlight-data-object');
  }

  setNewModelContentVariableContent() {
    this.viewer.saveXML(
      {
        format: true
      },
      (err: any, xml: string) => {
        this.updateModelContentVariable(xml);
      }
    );
  }

  /** Wrappers to access elementsHandler functions*/

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

}
