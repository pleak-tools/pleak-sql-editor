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