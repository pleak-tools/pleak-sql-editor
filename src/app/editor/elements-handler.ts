import * as Viewer from 'bpmn-js/lib/NavigatedViewer';
import {HttpClient, HttpResponse} from '@angular/common/http';
import { AnalysisHandler } from './analysis-handler';
import { DataObjectHandler } from "./data-object-handler";
import { Http } from '@angular/http';

declare let $: any;
let is = (element, type) => element.$instanceOf(type);

export class ElementsHandler {

  constructor(public http: HttpClient, viewer: Viewer, diagram: String, pg_parser, parent: any, canEdit: Boolean) {
    this.viewer = viewer;
    this.eventBus = this.viewer.get('eventBus');
    this.canvas = this.viewer.get('canvas');
    this.diagram = diagram;
    this.pg_parser = pg_parser;
    this.parent = parent;
    this.canEdit = canEdit;

    // this.analysisHandler = new AnalysisHandler(this.viewer, this.diagram, this);
  }

  viewer: Viewer;
  eventBus: any;
  canvas: any;
  diagram: String;
  pg_parser: any;
  parent: any;
  canEdit: Boolean;

  analysisHandler: AnalysisHandler;
  dataObjectHandlers: DataObjectHandler[] = [];

  public click(element) {
    if ((is(element.businessObject, 'bpmn:DataObjectReference'))) {
      this.canvas.removeMarker(element.id, 'selected');
      let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function (obj) {
        return obj.dataObject != element.businessObject && obj.beingEdited;
      });
      if (beingEditedDataObjectHandler.length > 0) {
        beingEditedDataObjectHandler[0].checkForUnsavedDataObjectChangesBeforeTerminate();
      }
    }

    let toBeEditedelementHandler = [];
    if (!this.isAnotherTaskOrDataObjectBeingEdited(element.id)) {
      if (is(element.businessObject, 'bpmn:DataObjectReference')) {
        toBeEditedelementHandler = this.dataObjectHandlers.filter(function (obj) {
          return obj.dataObject == element.businessObject && obj.beingEdited == false;
        });
        if (toBeEditedelementHandler.length > 0) {
          toBeEditedelementHandler[0].initDataObjectOptionsEditProcess();
        }
      }
    }
    
    this.prepareParser();
  }

  // Check if another element (compared to the input id) is being currently edited
  isAnotherTaskOrDataObjectBeingEdited(elementId: string) {
    let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function (obj) {
      return obj.beingEdited;
    });

    return beingEditedDataObjectHandler.length > 0 && beingEditedDataObjectHandler[0].dataObject.id !== elementId;
  }

  // Create handler instance for each task / messageFlow of model
  createElementHandlerInstances(definitions: any) {
    for (let diagram of definitions.diagrams) {
      let element = diagram.plane.bpmnElement;
      if (element.$type === "bpmn:Process") {
        if (element.flowElements) {
          for (let node of element.flowElements.filter((e: any) => is(e, "bpmn:DataObjectReference"))) {
            this.dataObjectHandlers.push(new DataObjectHandler(this.http, this, node));
          }
        }
      } else {
        for (let participant of element.participants) {
          if (participant.processRef && participant.processRef.flowElements) {
            for (let node of participant.processRef.flowElements.filter((e: any) => is(e, "bpmn:DataObjectReference"))) {
              this.dataObjectHandlers.push(new DataObjectHandler(this.http, this, node));
            }
          }
        }
      }
    }
  }

  prepareParser() {
    let self = this;
    return new Promise(() => {
      let result = this.pg_parser.parse("");
      if (!result.parse_tree.length) {
        self.parent.loaded = true;
      }
    });
  }

  updateModelContentVariable(xml: String) {
    this.parent.newChanges = true;
    this.parent.updateModelContentVariable(xml);
    $('#analysis-results-panel-content').html('');
    $('#analysis-results-panel').hide();
  }

  // Get dataObjectHandler instance of dataObject by dataObject id
  getDataObjectHandlerByDataObjectId(dataObjectId: String) {
    let dataObjectHandler = null;
    let dataObjectHandlerWithMessageFlowId = this.getAllModelDataObjectHandlers().filter(function (obj) {
      return obj.dataObject.id == dataObjectId;
    });
    if (dataObjectHandlerWithMessageFlowId.length > 0) {
      dataObjectHandler = dataObjectHandlerWithMessageFlowId[0];
    }
    return dataObjectHandler;
  }

  // Get all dataObjectHandler instances of the model
  getAllModelDataObjectHandlers() {
    return this.dataObjectHandlers;
  }

  // Check for unsaved changes on model
  areThereUnsavedChangesOnModel() {
    let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function (obj) {
      return obj.beingEdited;
    });

    if (beingEditedDataObjectHandler.length > 0) {
      if (beingEditedDataObjectHandler[0].areThereUnsavedDataObjectChanges()) {
        return true;
      }
    }
  }
}