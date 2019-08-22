import { Component, Input, Output, EventEmitter } from '@angular/core';
import { EditorComponent } from "../editor/editor.component";
import { Http } from '@angular/http';
import { PetriNets } from "../analyser/PetriNets";
import { LeaksWhenRequests } from '../editor/leaks-when-requests';
import { PolicyHelper } from '../editor/policy-helper';
import { HttpClient } from '@angular/common/http';

declare var $: any;
const is = (element, type) => element.$instanceOf(type);

@Component({
  selector: 'ga-panel',
  templateUrl: 'ga-panel.component.html',
  styleUrls: ['ga-panel.component.less']
})
export class GAPanelComponent {
  // @Output() save: EventEmitter<any> = new EventEmitter();

  constructor(public http: Http) {
  }

  public sidebarTitle: String = 'Analysis settings';
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
  public selectedTasks: any = [];
  public tasksList = [];
  public dtoTaskMapping: any = {};
  public dropdownSettings: any = {
    singleSelection: false, 
    text:"Select tasks",
    selectAllText:'Select All',
    unSelectAllText:'UnSelect All',
    enableSearchFilter: false
  };
  private static taskDtoOrdering = {};

  init(gaInputs, registry, canvas) {
    const self = this;

    if (gaInputs.length) {
      self.roles = gaInputs;
      self.attackingParty = gaInputs[0];
      if (gaInputs.length > 1) {
        self.targetParty = gaInputs[1];
      } else {
        self.targetParty = gaInputs[0];
      }
    }

    self.canvas = canvas;
    self.registry = registry;

    self.isEditing = true;
  }

  onItemSelect(item:any){
    this.canvas.addMarker(item.id, 'highlight-input-selected');
  }
  OnItemDeSelect(item:any){
    this.canvas.removeMarker(item.id, 'highlight-input-selected');
  }
  onSelectAll(items: any){
      
  }
  onDeSelectAll(items: any){
      
  }

  selectDataObject(e) {
    let self = this;
    self.buildDtoTasksMapping();

    for (var i in self.registry._elements) {
      let el = self.registry._elements[i].element;
      if (is(el.businessObject, 'bpmn:DataObjectReference')) {
        if (el.businessObject && el.businessObject.id == self.targetDataObject.id) {
          self.canvas.addMarker(el.id, 'highlight-group');
          self.tasksList = self.dtoTaskMapping[el.businessObject.id];
        }
        else {
          self.canvas.removeMarker(el.id, 'highlight-group');
        }
      }
    }
  }

  public static runPropagationAnalysis(registry, http, callback) {
    let self = this;
    let schemas = [];
    let queries = [];
    let tableDatas = [];
    let attackerSettings = [];
    let visitedNodes = [];
    let intermediates = [];

    let startBpmnEvents = [];
    for (let i in registry._elements) {
      if (registry._elements[i].element.type == "bpmn:StartEvent") {
        startBpmnEvents.push(registry._elements[i].element.businessObject);
      }
    }
    
    let petriNet = {};
    let maxPlaceNumberObj = { maxPlaceNumber: 0 };

    PetriNets.removePetriMarks(registry);

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

    let serverPetriFileName = EditorComponent.file.id + "_" + EditorComponent.file.title.substring(0, EditorComponent.file.title.length - 5);

    for (var i in registry._elements) {
      var node = registry._elements[i].element;

      if (is(node.businessObject, 'bpmn:Task') || is(node.businessObject, 'bpmn:IntermediateCatchEvent') || 
          is(node.businessObject, 'bpmn:StartEvent')) {
        if(node.businessObject.dataOutputAssociations){
          node.businessObject.dataOutputAssociations.forEach(x => {
            if(!x.targetRef.sqlScript){
              intermediates.push([x.targetRef.name, x.targetRef.id]);
            }
          });
        }
      }

      if (is(node.businessObject, 'bpmn:Task')) {
        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          let tempSchemas = [];
          let tempAttackerSettings = [];
          // let tempTableDatas = [];

          if(node.businessObject.dataInputAssociations){
            node.businessObject.dataInputAssociations.forEach(x => {
              if (!visitedNodes.includes(x.sourceRef[0].id)) {
                visitedNodes.push(x.sourceRef[0].id);
  
                if (x.sourceRef[0].sqlScript)
                  tempSchemas.push(x.sourceRef[0].sqlScript);
  
                if (x.sourceRef[0].tableData) {
                  let tableName = x.sourceRef[0].name.toLowerCase().replace(' ', '_');
  
                  // Attacker settings
                  // We have to add table name for each attribute
                  let curSettings = x.sourceRef[0].attackerSettings;
                  if (!!curSettings) {
                    curSettings = curSettings.split('\n').join(`\n${tableName}.`);
                    curSettings = `${tableName}.${curSettings}`;
                    tempAttackerSettings.push(curSettings);
                  }
  
                  if (!!x.sourceRef[0].tableData) {
                    tableDatas.push({ name: tableName, db: GAPanelComponent.getPreparedQueries(x.sourceRef[0].tableData) });
                  }
                }
              }
            });
          }

          if (node.businessObject.sqlScript)
            queries.push(node.businessObject.sqlScript);

          schemas = schemas.concat(tempSchemas);
          attackerSettings = attackerSettings.concat(tempAttackerSettings);
        }
      }
    }

    LeaksWhenRequests.sendPropagationRequest(http, serverPetriFileName, JSON.stringify(petriNetArray), matcher, this.taskDtoOrdering, intermediates, schemas, queries, tableDatas, attackerSettings, (output) => callback(output));
  }

  runAnalysis() {
    let self = this;
    let schemas = [];
    let queries = [];
    let tableDatas = [];
    let attackerSettings = [];
    let visitedNodes = [];

    // Policy
    const participants = PolicyHelper.groupPoliciesByParticipants(self.registry);
    const policies = participants.length
      ? participants.find(x => x.name === self.targetParty.id).policies
      : self.roles[0].policies;

    for (var i in self.registry._elements) {
      const node = self.registry._elements[i].element;

      if (node.type == "bpmn:Task" && !!self.selectedTasks.find(x => x.id == node.businessObject.id)) {
        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          let isGAInputFound = false;
          const tempSchemas = [];
          const tempAttackerSettings = [];
          // let tempTableDatas = [];

          node.businessObject.dataInputAssociations.forEach(x => {
            if (!visitedNodes.includes(x.sourceRef[0].id)) {
              visitedNodes.push(x.sourceRef[0].id);
              if(!self.dtoTaskMapping[x.sourceRef[0].id])
                self.dtoTaskMapping[x.sourceRef[0].id] = [];

              self.dtoTaskMapping[x.sourceRef[0].id].push({id: node.businessObject.id, name: node.businessObject.name});

              if (x.sourceRef[0].sqlScript)
                tempSchemas.push(x.sourceRef[0].sqlScript);

              if (x.sourceRef[0].tableData) {
                const tableName = x.sourceRef[0].name.toLowerCase().replace(' ', '_');

                // Attacker settings
                // We have to add table name for each attribute
                let curSettings = x.sourceRef[0].attackerSettings;
                if (!!curSettings) {
                  curSettings = curSettings.split('\n').join(`\n${tableName}.`);
                  curSettings = `${tableName}.${curSettings}`;
                  tempAttackerSettings.push(curSettings);
                }

                if (!!x.sourceRef[0].tableData) {
                  tableDatas.push({ name: tableName, db: GAPanelComponent.getPreparedQueries(x.sourceRef[0].tableData) });
                }
              }
            }

            if (x.sourceRef[0].id == self.targetDataObject.id) {
              isGAInputFound = true;
            }
          });

          if (isGAInputFound) {
            queries.push(GAPanelComponent.pruneQueryForGA(node.businessObject.sqlScript));
            schemas = schemas.concat(tempSchemas);
            attackerSettings = attackerSettings.concat(tempAttackerSettings);
          }
        }
      }
    }

    $('#leaksWhenServerError').hide();
    $('#analysis-results-panel').show();
    $('.analysis-spinner').fadeIn();
    LeaksWhenRequests.sendGARequest(this.http, schemas, queries, tableDatas, policies.map(x => x.script).filter(x => !!x), attackerSettings, self.attackerAdvantage, (output) => self.showResults(output, self));
    // LeaksWhenRequests.sendPropagationRequest(this.http, schemas, queries, tableDatas, policies.map(x => x.script).filter(x => !!x), attackerSettings, self.attackerAdvantage, (output) => self.showResults(output, self));
  }

  public buildDtoTasksMapping(){
    let self = this;

    for (var i in self.registry._elements) {
      var node = self.registry._elements[i].element;

      if (node.type == "bpmn:Task") {
        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          node.businessObject.dataInputAssociations.forEach(x => {
            if(!self.dtoTaskMapping[x.sourceRef[0].id])
              self.dtoTaskMapping[x.sourceRef[0].id] = [];

            self.dtoTaskMapping[x.sourceRef[0].id].push({id: node.businessObject.id, itemName: node.businessObject.name});
          });
        }
      }
    }

  }

  static getPreparedQueries(tableData) {
    const inputDB = JSON.parse(tableData);

    if (inputDB) {
      let DBOutput = '';
      for (const row of inputDB) {
        for (const col of row) {
          DBOutput += col + ' ';
        }
        DBOutput = DBOutput.trim() + '\n';
      }
      DBOutput = DBOutput.trim();
      return DBOutput;
    }
  }

  static pruneQueryForGA(query) {
    //   create or replace function aggr_count(portname TEXT)
    //   returns TABLE(cnt INT8) as
    // $$
    //   select count(ship_2.ship_id) as cnt
    //   from ship_2, port_2, parameters
    //   where port_2.name = parameters.portname
    //     AND (point(ship_2.latitude, ship_2.longitude) <@> point(port_2.latitude, port_2.longitude)) / ship_2.max_speed <= parameters.deadline
    // $$
    // language SQL IMMUTABLE returns NULL on NULL INPUT;

    const parts = [];
    let delimIndex = query.indexOf('$$');

    while (delimIndex !== -1) {
      const funcIndex = query.indexOf('function');
      const braceIndex = query.substring(funcIndex, query.length).indexOf('(');
      const funcName = query.substring(funcIndex + 9, funcIndex + braceIndex);

      query = query.substring(delimIndex + 2, query.length);
      delimIndex = query.indexOf('$$');
      const partQuery = query.substring(0, delimIndex);
      parts.push(`insert into ${funcName}${partQuery};`);

      query = query.substring(delimIndex + 2, query.length);
      delimIndex = query.indexOf('$$');
    }

    const res = parts.join('\n');
    return res;
  }

  showResults(output, self) {
    const lines = output.split(String.fromCharCode(30));
    self.analysisResult = lines;
    // this.setChangesInModelStatus(false);
    self.showAnalysisResults();
  }

  showAnalysisResults() {
    if (this.analysisResult) {
      let resultsHtml = '';

      let priorGuessProbability: any = Number.parseFloat(this.analysisResult[0]).toFixed(2);
      priorGuessProbability = (priorGuessProbability === 0 ? 0 : priorGuessProbability);
      priorGuessProbability = ( isNaN(priorGuessProbability) ? '&infin;' : priorGuessProbability + ' %' );

      let posteriorGuessProbability: any = Number.parseFloat(this.analysisResult[1]).toFixed(2);
      posteriorGuessProbability = (posteriorGuessProbability === 0 ? 0 : posteriorGuessProbability);
      posteriorGuessProbability = ( isNaN(posteriorGuessProbability) ? '&infin;' : posteriorGuessProbability + ' %' );

      const expectedCost: any = Number.parseFloat(this.analysisResult[2]).toFixed(2);

      let relativeError: any = Number.parseFloat(this.analysisResult[3]).toFixed(2);
      relativeError = (relativeError === 0 ? 0 : relativeError);
      relativeError = ( isNaN(relativeError) ? '&infin;' : relativeError + ' %' );

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
      const resultsString = fail.json().error;
      const parts = resultsString.split('ERROR: ');
      if (parts.length > 1) {
        this.analysisResult = parts[1].replace('WARNING:  there is no transaction in progress', '');
      } else {
        const parts2 = resultsString.split('banach: ');
        if (parts2.length > 1) {
          this.analysisResult = parts2[1];
        } else {
          this.analysisResult = 'Invalid input';
        }
      }
    } else if (fail.status === 400) {
      this.analysisResult = 'Analyzer error';
    } else {
      this.analysisResult = 'Server error';
    }
    this.showAnalysisErrorResult();
  }

  showAnalysisErrorResult() {
    const resultsHtml = '<div style="text-align:left"><font style="color:darkred"><span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ' + this.analysisResult + '</font></div>';
    $('.analysis-spinner').hide();
    $('#analysis-results-panel-content').html(resultsHtml);
  }

  clear() {
    this.dataObjects = [];
    this.roles = [];
    this.selectedTasks = [];
    this.tasksList = [];
  }

  closeSQLScriptPanel() {
    const self = this;
    self.clear();
    for (const i in self.registry._elements) {
      const el = self.registry._elements[i].element;
      if (is(el.businessObject, 'bpmn:DataObjectReference')) {
        self.canvas.removeMarker(el.id, 'highlight-group');
      }
      if (is(el.businessObject, 'bpmn:Task')) {
        self.canvas.removeMarker(el.id, 'highlight-input-selected');
      }
    }

    self.isEditing = false;
  }
}
