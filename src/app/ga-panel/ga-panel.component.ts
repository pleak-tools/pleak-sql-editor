import { Component, Input, Output, EventEmitter } from '@angular/core';
import { LeaksWhenRequests } from "../editor/leaks-when-requests";
import { PolicyHelper } from "../editor/policy-helper";
import { Http } from '@angular/http';

declare var $: any;
let is = (element, type) => element.$instanceOf(type);

@Component({
  selector: 'ga-panel',
  templateUrl: '/ga-panel.component.html',
  styleUrls: ['/ga-panel.component.less']
})
export class GAPanelComponent {
  // @Output() save: EventEmitter<any> = new EventEmitter();

  constructor(public http: Http){
  }

  public sidebarTitle: String = "Analysis settings";
  public isEditing: Boolean = false;
  
  public roles: Array<any> = [];
  public dataObjects: Array<String> = [];
  public attackerAdvantage = 0.3;
  public attackingParty;
  public targetParty;
  public targetDataObject;
  public canvas: any;
  public registry: any;
  public analysisResult: any;

  init(gaInputs, registry, canvas) {
    let self = this;
    self.roles = gaInputs;
    self.attackingParty = gaInputs[0];
    self.targetParty = gaInputs[1];

    self.canvas = canvas;
    self.registry = registry;

    self.isEditing = true;
    setTimeout(() => {
      $('#CancelEditing').on('click', () => self.closeSQLScriptPanel());
    }, 50);
  }

  selectDataObject(e) {
    let self = this;
    
    for (var i in self.registry._elements) {
      let el = self.registry._elements[i].element;
      if(is(el.businessObject, 'bpmn:DataObjectReference')){
        if (el.businessObject && el.businessObject.id == self.targetDataObject.id) {
          self.canvas.addMarker(el.id, 'highlight-group');
        }
        else {
          self.canvas.removeMarker(el.id, 'highlight-group');
        }
      }
    }
  }

  runAnalysis() {
    let self = this;
    let schemas = [];
    let queries = [];
    let tableDatas = [];
    let attackerSettings = [];
    
    // Policy
    let participants = PolicyHelper.groupPoliciesByParticipants(self.registry);
    let policies = participants.find(x => x.name == self.targetParty.id).policies;
    
    for (var i in self.registry._elements) {
      var node = self.registry._elements[i].element;

      if (node.type == "bpmn:Task") {
        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          let isGAInputFound = false;
          let tempSchemas = [];
          let tempAttackerSettings = [];
          let tempTableDatas = [];

          node.businessObject.dataInputAssociations.forEach(x => {
            tempSchemas.push(x.sourceRef[0].sqlScript);
            if(x.sourceRef[0].tableData){
              // Attacker settings
              // We have to add table name for each attribute
              let curSettings = x.sourceRef[0].attackerSettings;
              if(!!curSettings){
                let tableName = x.sourceRef[0].name.toLowerCase().replace(' ', '_');
                curSettings = curSettings.split('\n').join(`\n${tableName}.`);
                curSettings = `${tableName}.${curSettings}`;
                tempAttackerSettings.push(curSettings);
              }
              
              if(!!x.sourceRef[0].tableData){
                tempTableDatas.push(x.sourceRef[0].tableData);
              }
            }

            if(x.sourceRef[0].id == self.targetDataObject.id) {
              isGAInputFound = true;
            }
          });

          if(isGAInputFound) {
            queries.push(node.businessObject.sqlScript);
            schemas = schemas.concat(tempSchemas);
            tableDatas = tableDatas.concat(tempTableDatas);
            attackerSettings = attackerSettings.concat(tempAttackerSettings);
          }
        }
      }
    }

    $('#analysis-results-panel').show();
    $('.analysis-spinner').fadeIn();
    LeaksWhenRequests.sendGARequest(this.http, schemas, queries, policies.map(x => x.script).filter(x => !!x), attackerSettings, self.attackerAdvantage, (output) => self.showResults(output, self));
  }

  showResults(output, self) {
    let lines = output.split(String.fromCharCode(30));
    self.analysisResult = lines;
    // this.setChangesInModelStatus(false);
    self.showAnalysisResults();
  }

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

  showAnalysisErrorResult() {
    let resultsHtml = '<div style="text-align:left"><font style="color:darkred"><span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ' + this.analysisResult + '</font></div>';
    $('.analysis-spinner').hide();
    $('#analysis-results-panel-content').html(resultsHtml);
  }

  clear() {
    this.dataObjects = [];
    this.roles = [];
  }

  closeSQLScriptPanel() {
    let self = this;
    
    for (var i in self.registry._elements) {
      let el = self.registry._elements[i].element;
      if (is(el.businessObject, 'bpmn:DataObjectReference')) {
        self.canvas.removeMarker(el.id, 'highlight-group');
      }
    }

    self.isEditing = false;
  }
}