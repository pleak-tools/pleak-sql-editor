import { PolicyHelper } from "./policy-helper";
declare var $: any;
let is = (element, type) => element.$instanceOf(type);

export class SimpleDisclosureAnalysis {

  public static SelectedTarget = {
    simplificationDto: null,
    r: null,
    c: null,
    selectedTargetForLeaksWhen: null
  };

  public static showPopup(registry) {
    let rolesDisclosures = {};
    let parties = PolicyHelper.getParticipantsInfoForGA(registry);

    let maxPlaceNumberObj = { maxPlaceNumber: 1 };
    for (let i in registry._elements) {
      if (registry._elements[i].element.type == "bpmn:StartEvent") {
        SimpleDisclosureAnalysis.orderLaneDtos(registry, registry._elements[i].element.businessObject, maxPlaceNumberObj);
      }
    }

    let messageFlows = SimpleDisclosureAnalysis.handleMessageFlows(registry, rolesDisclosures);

    let allDtos = [];
    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if (is(node.businessObject, 'bpmn:DataObjectReference')) {
        if (!allDtos.find(x => x.id == node.businessObject.id))
          allDtos.push(node.businessObject);
      }
    }

    allDtos = allDtos.sort((x, y) => {
      return x.orderingIndex <= y.orderingIndex ? x : y;
    });

    let table = "";
    table += '<table class="table" style="text-align:center">';
    table += '<tr><th style="background-color:#f5f5f5; text-align:center;">#</th>';

    // Data objects (header)
    for (let j = 0; j < allDtos.length; j++) {
      table += '<th style="background-color:#f5f5f5; text-align:center; vertical-align: middle;" class="dd-' + j + '">' + allDtos[j].name + '</th>';
      // $(document).off('click', '.dd-' + j);
      // $(document).on('click', '.dd-' + j, (e) => {
      //   $(document).find('.dd-' + j).css('background-color', 'springgreen').css('color', 'white');
      // });
    }

    table += '</tr>';
    for (let r = 0; r < parties.length; r++) {
      table += '<tr><td style="background-color:#f5f5f5;"><b>' + parties[r].label + '</b></td>';
      for (let c = 0; c < allDtos.length; c++) {
        var isDtoFound = false;
        for (var t in rolesDisclosures) {
          if (t == parties[r].label) {
            for (var t1 in rolesDisclosures[t]) {
              if (t1 == allDtos[c].name) {
                isDtoFound = true;
              }
            }
          }
        }
        if (isDtoFound) {
          table += '<td style="background-color:#f5f5f5;" class="dd-' + r + '-' + c + '">D</td>';
          if (allDtos[c].name != 'parameters') {
            $(document).off('click', '.dd-' + r + '-' + c);
            $(document).on('click', '.dd-' + r + '-' + c, (e) => {
              $(document).find('.dd-' + r + '-' + c).css('background-color', 'deepskyblue').css('color', 'white');
              if (SimpleDisclosureAnalysis.SelectedTarget.simplificationDto) {
                $(document).find('.dd-' + SimpleDisclosureAnalysis.SelectedTarget.r + '-' + SimpleDisclosureAnalysis.SelectedTarget.c).css('background-color', '#f5f5f5').css('color', 'black');
              }
              SimpleDisclosureAnalysis.SelectedTarget.simplificationDto = allDtos[c];
              SimpleDisclosureAnalysis.SelectedTarget.c = c;
              SimpleDisclosureAnalysis.SelectedTarget.r = r;

              SimpleDisclosureAnalysis.findOutputDtoForLeaksWhen(messageFlows, allDtos);
            });
          }
        }
        else {
          if (allDtos[c].visibility && allDtos[c].participant.businessObject.name != parties[r].label) {
            table += '<td style="background-color:#f5f5f5;" class="dd-' + r + '-' + c + '">I</td>';
            if (allDtos[c].name != 'parameters') {
              $(document).off('click', '.dd-' + r + '-' + c);
              $(document).on('click', '.dd-' + r + '-' + c, (e) => {
                $(document).find('.dd-' + r + '-' + c).css('background-color', 'deepskyblue').css('color', 'white');
                if (SimpleDisclosureAnalysis.SelectedTarget.simplificationDto) {
                  $(document).find('.dd-' + SimpleDisclosureAnalysis.SelectedTarget.r + '-' + SimpleDisclosureAnalysis.SelectedTarget.c).css('background-color', '#f5f5f5').css('color', 'black');
                }
                SimpleDisclosureAnalysis.SelectedTarget.simplificationDto = allDtos[c];
                SimpleDisclosureAnalysis.SelectedTarget.c = c;
                SimpleDisclosureAnalysis.SelectedTarget.r = r;

                SimpleDisclosureAnalysis.findOutputDtoForLeaksWhen(messageFlows, allDtos);
              });
            }
          }
          else {
            table += '<td>-</td>';
          }
        }
      }
      table += '</tr>';
    }
    table += '</table>';
    $('#simpleDisclosureReportModal').find('#report-table').html('').html(table);
    $('#simpleDisclosureReportModal').find('#simpleDisclosureReportTitle').text('Test');
    $('#simpleDisclosureReportModal').modal();
  }

  private static handleMessageFlows(registry, rolesDisclosures) {
    let messageFlows = [];
    let roles = PolicyHelper.getParticipantsInfoForGA(registry);

    let participants = [];
    for (var i in registry._elements) {
      if (registry._elements[i].element.type == "bpmn:Participant") {
        let curPart = registry._elements[i].element;
        participants.push({ name: curPart.businessObject.name, dtos: [] });

        for (var j = 0; j < curPart.children.length; j++) {
          if ((is(curPart.children[j].businessObject, 'bpmn:DataObjectReference') ||
            is(curPart.children[j].businessObject, 'bpmn:Task') ||
            is(curPart.children[j].businessObject, 'bpmn:StartEvent')) &&
            curPart.children[j].businessObject) {
            participants[participants.length - 1].dtos.push(curPart.children[j].businessObject);
            curPart.children[j].businessObject.participant = curPart;
          }
        }
      }
    }

    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if (node.type == "bpmn:MessageFlow") {
        var source = node.businessObject.sourceRef;
        var target = node.businessObject.targetRef;
        var targetOutputDto = target.dataOutputAssociations[0].targetRef;
        var outputLane = roles[0];

        messageFlows.push({ source: source, target: target });

        for (let j = 0; j < roles.length; j++) {
          let isOuputDtoFound = false;
          for (let k = 0; k < roles[j].dataObjects.length; k++) {
            if (roles[j].dataObjects[k].id == targetOutputDto.id) {
              isOuputDtoFound = true;
              outputLane = roles[j];
              break;
            }
          }
          if (isOuputDtoFound) {
            break;
          }
        }

        if (!rolesDisclosures[outputLane.label])
          rolesDisclosures[outputLane.label] = {};

        let parentLane = participants.find(x => !!x.dtos.find(y => y.orderingIndex == source.orderingIndex));
        parentLane.dtos.filter(x => x.orderingIndex < source.orderingIndex).forEach(x => x.visibility = "I");

        // Direct disclosures are data objects that attached as an input to the task with message flow
        source.dataInputAssociations.forEach(x => {
          let dto = x.sourceRef[0];

          for (let j = 0; j < roles.length; j++) {
            let isInputDtoFound = false;
            for (let k = 0; k < roles[j].dataObjects.length; k++) {
              if (roles[j].dataObjects[k].id == dto.id) {
                isInputDtoFound = true;
                break;
              }
            }
            if (!isInputDtoFound) {
              rolesDisclosures[outputLane.label][dto.name] = 'V';
              break;
            }
          }
        });
      }
    }

    return messageFlows;
  }

  private static orderLaneDtos(registry, startBusinessObj, maxPlaceNumberObj) {
    let currentRun = [];
    let st = [startBusinessObj];
    let xorSplitStack = [];

    while (st.length > 0) {
      let curr = st.pop();
      if (!curr.orderingIndex)
        curr.orderingIndex = maxPlaceNumberObj.maxPlaceNumber++;
      currentRun.push(curr);

      let inc = curr.incoming ? curr.incoming.map(x => x.sourceRef) : null;
      let out = curr.outgoing ? curr.outgoing.map(x => x.targetRef) : null;

      if (curr.outgoing && curr.incoming && !curr.isProcessed) {
        var ident = curr.id;
        if (curr.$type == "bpmn:ParallelGateway") {
          ident = ident.replace("Exclusive", "Parallel");
        }

        curr.isProcessed = curr.incoming.reduce((acc, cur) => {
          return acc && !!cur.petriPlace;
        }, true);
      }

      var isAllPredecessorsInRun = !inc || inc.reduce((acc, cur) => acc && !!currentRun.find(x => x == cur), true);
      if (isAllPredecessorsInRun || curr.$type == 'bpmn:ExclusiveGateway' && out.length == 1 ||
        curr.$type == 'bpmn:EndEvent') {
        if (!!curr.stackImage) {
          // Cycle check
          continue;
        }
        if (curr.$type == 'bpmn:ExclusiveGateway' && inc.length == 1) {
          curr.stackImage = st.slice();
          xorSplitStack.push(curr);
          out.forEach(x => st.push(x));
        }
        else {
          if (curr.$type != 'bpmn:EndEvent') {
            out.forEach(x => st.push(x));
          }
        }
      }
    }

    // Data Objects handling
    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if ((is(node.businessObject, 'bpmn:Task') || is(node.businessObject, 'bpmn:IntermediateCatchEvent'))) {
        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          node.businessObject.dataInputAssociations.forEach(x => {
            if (!x.sourceRef[0].orderingIndex)
              x.sourceRef[0].orderingIndex = node.businessObject.orderingIndex;
          });
        }
      }
    }
  }

  private static findOutputDtoForLeaksWhen(messageFlows, allDtos) {
    let nextMessageFlows = messageFlows
      .filter(x => (x.source.participant.id == SimpleDisclosureAnalysis.SelectedTarget.simplificationDto.participant.id) &&
        x.source.orderingIndex >= SimpleDisclosureAnalysis.SelectedTarget.simplificationDto.orderingIndex);
    nextMessageFlows = nextMessageFlows.sort((a, b) => a.source.orderingIndex - b.source.orderingIndex);

    if (nextMessageFlows.length) {
      let nextMessageFlow = nextMessageFlows[0];
      let outputDtos = allDtos.filter(x => x.name != 'parameters' && (x.participant.id == nextMessageFlow.target.participant.id) &&
        (x.orderingIndex >= nextMessageFlow.target.orderingIndex));
      outputDtos = outputDtos.sort((a, b) => a.orderingIndex - b.orderingIndex);
      if(outputDtos.length){
        let outputDto = outputDtos[0];
        SimpleDisclosureAnalysis.SelectedTarget.selectedTargetForLeaksWhen = outputDto;
      }
    }
  }
}