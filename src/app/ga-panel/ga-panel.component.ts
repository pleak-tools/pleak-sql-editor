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

  // public resultTable: Array<any> = [];
  // public isShowRoles: boolean = false;
  // public analysisSteps: Array<any> = [];
  public sidebarTitle: String = "Analysis settings";
  public isEditing: Boolean = false;
  
  public roles: Array<any> = [];
  public dataObjects: Array<String> = [];
  public attackerAdvantage = 30;
  public attackingParty;
  public targetParty;
  public targetDataObject;
  public canvas: any;
  public registry: any;

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
          node.businessObject.dataInputAssociations.forEach(x => {
            if(x.sourceRef[0].id == self.targetDataObject.id && x.sourceRef[0].tableData) {
              isGAInputFound = true;
              tableDatas.push(x.sourceRef[0].tableData);
              schemas.push(x.sourceRef[0].sqlScript);

              // Attacker settings
              attackerSettings.push(x.sourceRef[0].attackerSettings);
            }
          });

          if(isGAInputFound) {
            queries.push(node.businessObject.sqlScript);
          }
        }
      }
    }

    LeaksWhenRequests.sendGARequest(this.http, schemas, queries, policies.map(x => x.script), attackerSettings, self.attackerAdvantage);
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