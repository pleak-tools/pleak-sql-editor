import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { ElementsHandler } from "./elements-handler";

declare let $: any;
declare function require(name:string);
let is = (element, type) => element.$instanceOf(type);

let config = require('../../config.json');

export class AnalysisHandler {

  constructor(viewer: Viewer, diagram: String, parent: any) {
    this.viewer = viewer;
    this.eventBus = this.viewer.get('eventBus');
    this.registry = this.viewer.get('elementRegistry');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');
    this.diagram = diagram;
    this.elementsHandler = parent;
    this.editor = parent.parent;
  }

  viewer: Viewer;
  eventBus: any;
  registry: any;
  canvas: any;
  overlays: any;
  diagram: String;

  editor: any;
  elementsHandler: any;

  analysisInput: any = {children: [], queries: "", epsilon: 0.3, schemas: "", attackerSettings: "", sensitiveAttributes: ""};
  analysisResult: any = null;
  analysisInputTasksOrder: any = [];

  analysisErrors: any[] = [];
  numberOfErrorsInModel: Number = 0;

  init() {
    // No changes in model, so show previous analysis results
    if (!this.getChangesInModelStatus() && Number.parseFloat(this.analysisInput.epsilon) == Number.parseFloat($('.advantage-input').val()) && this.analysisInput.attackerSettings == this.elementsHandler.attackerSettingsHandler.getAttackerSettings() && this.analysisInput.sensitiveAttributes == this.elementsHandler.sensitiveAttributesHandler.getSensitiveAttributes()) {
      this.showAnalysisResults();
      return;
    }

    // Changes in model, so run new analysis
    this.analysisInput = {children: [], queries: "", epsilon: 0.3, schemas: "", attackerSettings: "", sensitiveAttributes: ""};
    let counter = this.getAllModelTaskHandlers().length;
    this.analysisErrors = [];
    for (let taskId of this.getAllModelTaskHandlers().map(a => a.task.id)) {
      this.prepareTaskAnalyzerInput(taskId, counter--, this.getAllModelTaskHandlers().length);
    }
    this.eventBus.on('element.click', (e) => {
      this.removeErrorHiglights();
    });
  }

  loadAnalysisPanelTemplate(roles) {
    if ($('#ga-panel').has('#analysis-panel').length) {
      this.initAnalysisPanels(roles);
    } else {
      $('#ga-panel').prepend($('<div>').load(config.frontend.host + '/' + config.sql_editor.folder + '/src/app/editor/templates/analysis-panels.html', () => {
        this.initAnalysisPanels(roles);
      }));
    }
  }

  initAnalysisPanels(roles) {
    $('#analysis-panel').off('click', '#run-analysis');
    let analysisPanels = $('#analysis-panels');
    analysisPanels.detach();
    $('#ga-panel').prepend(analysisPanels);
    $('#ga-panel').scrollTop(0);
    $('#analysis-panels').show();
    $('#analysis-panel').on('click', '#run-analysis', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let analysisPanels = $('#analysis-panels');
      analysisPanels.detach();
      $('#ga-panel').prepend(analysisPanels);
      $('#ga-panel').scrollTop(0);
      this.init();
      $('#analysis-results-panel').show();
    });
    $('#analysis-panel').on('click', '#analysis-settings-hide-button', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.removeErrorHiglights();
      $('#analysis-panels').hide();
    });
    // $('#analysis-panel').on('click', '#attacker-settings-button', (e) => {
    //   e.preventDefault();
    //   e.stopPropagation();
    //   this.elementsHandler.attackerSettingsHandler.initAttackerSettingsEditProcess();
    // });
    // $(document).find('#attacker-advantage-input').on('input', (e) => {
    //   let percent = Math.round($('#attacker-advantage-input').val() * 100);
    //   $('#analysis-panel').find('#attacker-advantage-label').text(percent);
    // });
    // $('#analysis-panel').on('click', '#sensitive-attributes-button', (e) => {
    //   e.preventDefault();
    //   e.stopPropagation();
    //   this.elementsHandler.sensitiveAttributesHandler.initSensitiveAttributesEditProcess();
    // });
  }

  // Format analyser input and send it to the analyser
  prepareTaskAnalyzerInput(taskId: string, counter: number, amount: number) {
    let task = this.getTaskHandlerByTaskId(taskId);
    let taskQuery = task.getPreparedQuery();
    if (taskQuery && taskQuery.success) {
      let taskName = taskQuery.success.taskName;
      let query = taskQuery.success.query;
      let fullQuery = "";
      let inputIds = task.getTaskInputObjects().map(a => a.id);
      let schemasQuery = "";
      for (let inputId of inputIds) {
        let dataObjectQueries = this.getPreparedQueriesOfDataObjectByDataObjectId(inputId);
        if (dataObjectQueries) {
          let alreadyAddedDataObject = this.analysisInput.children.filter(function( obj ) {
            return obj.id == inputId;
          });
          if (alreadyAddedDataObject.length === 0) {
            this.analysisInput.children.push(dataObjectQueries);
            if (dataObjectQueries.schema) {
              let schema = dataObjectQueries.schema + "\n";
             schemasQuery += schema;
            }
          }
        }
      }
      fullQuery = "INSERT INTO " + taskName + " " + query;
      this.analysisInput.queries += fullQuery + "\n\n";
      this.analysisInput.schemas += schemasQuery;
      this.analysisInputTasksOrder.push({id: taskId, order: Math.abs(counter-amount)});
      this.canvas.removeMarker(taskId, 'highlight-general-error');
      if (true) {
        if (this.analysisErrors.length === 0) {
          this.analysisInput.queries.trim();
          this.analysisInput.epsilon = Number.parseFloat($('.advantage-input').val());
          this.analysisInput.attackerSettings = this.elementsHandler.attackerSettingsHandler.getAttackerSettings();
          this.analysisInput.sensitiveAttributes = this.elementsHandler.sensitiveAttributesHandler.getSensitiveAttributes();
          $('.analysis-spinner').fadeIn();
          $('#analysis-results-panel-content').html('');
          this.runAnalysisREST(this.analysisInput);
        } else {
          this.showAnalysisErrorResults();
        }
      }
    } else {
      // this.addUniqueErrorToErrorsList(taskQuery.error, [taskId]);
      // if (counter === 1) {
      //   this.showAnalysisErrorResults();
      // }
    }
  }

  // Call to the analyser
  runAnalysisREST(postData: any) {
    this.editor.http.post(config.backend.host + '/rest/sql-privacy/analyze-guessing-advantage', postData, this.editor.authService.loadRequestOptions()).subscribe(
      success => {
        this.formatAnalysisResults(success);
      },
      fail => {
        this.formatAnalysisErrorResults(fail);
      }
    );
  }

  // Format analysis result string
  formatAnalysisResults(success: any) {
    if (success.status === 200) {
      let resultsString = success.json().result;
      if (resultsString) {
        let lines = resultsString.split(String.fromCharCode(30));
        this.analysisResult = lines;
        this.setChangesInModelStatus(false);
        this.showAnalysisResults();
      }
    }
  }

  // Format analysis error string
  formatAnalysisErrorResults(fail: any) {
    if (fail.status === 409) {
      let resultsString = fail.json().error;
      let parts = resultsString.split("ERROR: ");
      if (parts.length > 1) {
        this.analysisResult = parts[1].replace("WARNING:  there is no transaction in progress", "");
      } else {
        let parts2 = resultsString.split("banach: ");
        if (parts2.length > 1) {
          this.analysisResult = parts2[1];
        } else {
          this.analysisResult = "Invalid input";
        }
      }
    } else if (fail.status === 400) {
      this.analysisResult = "Analyzer error";
    } else {
      this.analysisResult = "Server error";
    }
    this.showAnalysisErrorResult();
  }

  // Show analysis results table
  showAnalysisResults() {
    if (this.analysisResult) {
      let resultsHtml = '';

      let priorGuessProbability: any = Number.parseFloat(this.analysisResult[0]).toFixed(2);
      priorGuessProbability = (priorGuessProbability == 0 ? 0 : priorGuessProbability);
      priorGuessProbability = ( isNaN(priorGuessProbability) ? "&infin;" : priorGuessProbability + " %" );

      let posteriorGuessProbability: any = Number.parseFloat(this.analysisResult[1]).toFixed(2);
      posteriorGuessProbability = (posteriorGuessProbability == 0 ? 0 : posteriorGuessProbability);
      posteriorGuessProbability = ( isNaN(posteriorGuessProbability) ? "&infin;" : posteriorGuessProbability + " %" );

      let expectedCost: any = Number.parseFloat(this.analysisResult[2]).toFixed(2);

      let relativeError: any = Number.parseFloat(this.analysisResult[3]).toFixed(2);
      relativeError = (relativeError == 0 ? 0 : relativeError);
      relativeError = ( isNaN(relativeError) ? "&infin;" : relativeError + " %" );

      resultsHtml += `
      <div class="" id="general-analysis-results">
        <div class="panel panel-default">
          <div class="panel-heading" style="background-color:#ddd">
          <b><span style="font-size: 16px; color: #666">summary</span></b>
          </div>
          <div class="panel-body">
            <table style="width:100%;text-align:right">
              <tbody>
                <tr><td style="width:70%;text-align:left"><b>80% relative error <br/>(additive noise / query output)</b></td><td>` + relativeError + `</td><tr>
                <tr><td style="width:70%;text-align:left"><b>Expected cost</b></td><td>` + expectedCost + `</td><tr>
              </tbody>
            </table>
            <div class="view-more-results-div" style="display:block;text-align:right;margin-top:10px;margin-bottom:10px"><span class="more-results-link">View more</span></div>
            <table style="width:100%;text-align:right;display:none" class="more-analysis-results">
              <tbody>
                <tr><td style="width:70%;text-align:left"><b>Guess probability (prior)</b></td><td>` + priorGuessProbability + `</td><tr>
                <tr><td style="width:70%;text-align:left"><b>Guess probability (posterior)</b></td><td>` + posteriorGuessProbability + `</td><tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

      $('.analysis-spinner').hide();
      $('#analysis-results-panel-content').html(resultsHtml);
      $('#analysis-results-panel-content').on('click', '.more-results-link', (e) => {
        $('.more-analysis-results').show();
        $('.view-more-results-div').hide();
      });
    }
  }

  // Show analysis errors list
  showAnalysisErrorResults() {
    $('#analysis-results-panel-content').html('');
    this.removeErrorHiglights();
    this.removeErrorsListClickHandlers();
    this.numberOfErrorsInModel = 0;
    if (this.analysisErrors.length > 0) {
      this.numberOfErrorsInModel = this.analysisErrors.length;
      let errors_list = '<ol style="text-align:left">';
      let i = 0;
      for (let error of this.analysisErrors) {
        let errorMsg = error.error.charAt(0).toUpperCase() + error.error.slice(1);
        errors_list += '<li class="error-list-element error-'+i+'" style="font-size:16px; color:darkred; cursor:pointer;">'+errorMsg+'</li>';
        $('#analysis-results-panel-content').on('click', '.error-' + i, (e) => {
          this.highlightObjectWithErrorByIds(error.object);
          $(e.target).css("font-weight", "bold");
        });
        i++;
      }
      errors_list += '</ol>';
      $('.analysis-spinner').hide();
      $('#analysis-results-panel-content').html(errors_list);
    }
  }

  // Show one error from analyzer
  showAnalysisErrorResult() {
    let resultsHtml = '<div style="text-align:left"><font style="color:darkred"><span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ' + this.analysisResult + '</font></div>';
    $('.analysis-spinner').hide();
    $('#analysis-results-panel-content').html(resultsHtml);
  }

  // Add unique error to errors list
  addUniqueErrorToErrorsList(error: String, ids: String[]) {
    let errors = this.analysisErrors;
    let sameErrorMsgs = errors.filter(function( obj ) {
      return obj.error == error && obj.object.toString() === ids.toString();
    });
    if (sameErrorMsgs.length === 0) {
      errors.push({error: error, object: ids});
    }
  }

  // Remove click handlers of error links in errors list
  removeErrorsListClickHandlers() {
    for (let j=0; j < this.numberOfErrorsInModel; j++) {
      $('#analysis-results-panel-content').off('click', '.error-' + j);
    }
  }

  // Highlight objects with stereotype errors by ids
  highlightObjectWithErrorByIds(generalIds: String[]) {
    this.removeErrorHiglights();
    for (let id of generalIds) {
      this.canvas.addMarker(id, 'highlight-general-error');
    }
  }

  // Remove error highlights
  removeErrorHiglights() {
    $('.error-list-element').css("font-weight", "");
    for (let taskHandler of this.getAllModelTaskHandlers()) {
      this.canvas.removeMarker(taskHandler.task.id, 'highlight-general-error');
    }
  }

  /* Wrapper functions to access elementHandler's functions */

  getTaskHandlerByTaskId(taskId: string) {
    return this.elementsHandler.getTaskHandlerByTaskId(taskId);
  }

  getPreparedQueriesOfDataObjectByDataObjectId(dataObjectId: string) {
    return this.elementsHandler.getDataObjectHandlerByDataObjectId(dataObjectId).getPreparedQueries();
  }

  getTaskHandlerByPreparedTaskName(preparedName: string) {
    return this.elementsHandler.getTaskHandlerByPreparedTaskName(preparedName);
  }

  getAllModelTaskHandlers() {
    return this.elementsHandler.getAllModelTaskHandlers();
  }

  /* Wrapper functions to access editor's functions */

  getChangesInModelStatus() {
    return this.editor.getChangesInModelStatus();
  }

  setChangesInModelStatus(status: boolean) {
    this.editor.setChangesInModelStatus(status);
  }

}