declare var $: any;

export class PolicyHelper {
  
  public static groupPoliciesByParticipants(registry) {
    let participants = [];

    for (var i in registry._elements) {
      if (registry._elements[i].element.type == "bpmn:Participant") {
        let curPart = registry._elements[i].element;
        participants.push({ name: curPart.id, policies: [] });
        if (curPart.businessObject.policyScript) {
          participants[participants.length - 1].policies.push({ name: 'laneScript', script: curPart.businessObject.policyScript });
        }

        for (var j = 0; j < curPart.children.length; j++) {
          if (curPart.children[j].type == "bpmn:DataObjectReference" && curPart.children[j].businessObject) {
            participants[participants.length - 1].policies.push({
              name: curPart.children[j].businessObject.id,
              script: (curPart.children[j].businessObject.policyScript ? curPart.children[j].businessObject.policyScript : "")
            });
          }
        }
      }
    }

    return participants;
  }

  public static getParticipantsInfoForGA(registry) {
    let participants = [];

    for (var i in registry._elements) {
      if (registry._elements[i].element.type == "bpmn:Participant") {
        let curPart = registry._elements[i].element;
        participants.push({ id: curPart.id, label: curPart.businessObject.name, tasks: [], policies: [], dataObjects: [] });
        if (curPart.businessObject.policyScript) {
          participants[participants.length - 1].policies.push({ name: 'laneScript', script: curPart.businessObject.policyScript });
        }

        for (var j = 0; j < curPart.children.length; j++) {
          if (curPart.children[j].type == "bpmn:DataObjectReference" && curPart.children[j].businessObject) {
            participants[participants.length - 1].policies.push({
              name: curPart.children[j].businessObject.id,
              script: (curPart.children[j].businessObject.policyScript ? curPart.children[j].businessObject.policyScript : "")
            });

            participants[participants.length - 1].dataObjects.push({
              label: curPart.children[j].businessObject.name,
              id: curPart.children[j].businessObject.id,
              sqlScript: curPart.children[j].businessObject.sqlScript,
              tableData: curPart.children[j].businessObject.tableData,
              attackerSettings: curPart.children[j].businessObject.attackerSettings
            });
          }
        }
      }
    }

    if(!participants.length) {
      let processRole = $('#fileName')[0].innerText.replace('.bpmn', '');
      participants.push({ id: processRole, label: processRole, tasks: [], policies: [], dataObjects: [] });

      for (var i in registry._elements) {
        let elem = registry._elements[i].element;
        if (elem.type == "bpmn:DataObjectReference" && elem.businessObject) {
          participants[0].policies.push({
            name: elem.businessObject.id,
            script: (elem.businessObject.policyScript 
              ? elem.businessObject.policyScript 
              : "")
          });

          participants[0].dataObjects.push({
            label: elem.businessObject.name,
            id: elem.businessObject.id,
            sqlScript: elem.businessObject.sqlScript,
            tableData: elem.businessObject.tableData,
            attackerSettings: elem.businessObject.attackerSettings
          });
        }
      }
    }

    return participants;
  }

  public static extractRoles(registry) {
    let laneRoles = [];
    let processRole = $('#fileName')[0].innerText.replace('.bpmn', '');
    let reg = new RegExp(/^[A-Za-z ]+$/);

    // First we try to find BPMN lanes
    // If not any, then we take process name as the only role
    for (var i in registry._elements) {
      if (registry._elements[i].element.type == "bpmn:Participant") {
        laneRoles.push(registry._elements[i].element.businessObject.name);
        // laneRoles.push(reg.exec(registry._elements[i].element.businessObject.name)[0]);
      }
    }

    return laneRoles.length ? laneRoles : [processRole];
  }
}