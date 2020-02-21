import { PolicyHelper } from "./policy-helper";
declare var $: any;
let is = (element, type) => element.$instanceOf(type);

export class SimpleDisclosureAnalysis {

  public static SelectedTarget = {
    simplificationDto: null,
    r: null,
    c: null,
    selectedTargetsForLeaksWhen: []
  };

  public static showPopup(registry, esd) {
    let rolesDisclosures = {};
    SimpleDisclosureAnalysis.SelectedTarget = {
      simplificationDto: null,
      r: null,
      c: null,
      selectedTargetsForLeaksWhen: []
    };

    let maxPlaceNumberObj = { maxPlaceNumber: 1 };
    for (let i in registry._elements) {
      if (registry._elements[i].element.type == "bpmn:StartEvent") {
        SimpleDisclosureAnalysis.orderLaneDtos(registry, registry._elements[i].element.businessObject, maxPlaceNumberObj);
      }
    }

    let messageFlows = SimpleDisclosureAnalysis.handleMessageFlows(registry, rolesDisclosures);

    let allDtos = [];
    let allTasks = [];
    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if (is(node.businessObject, 'bpmn:DataObjectReference')) {
        if (!allDtos.find(x => x.id == node.businessObject.id))
          allDtos.push(node.businessObject);
      }
      if (is(node.businessObject, 'bpmn:Task')) {
        if (!allTasks.find(x => x.id == node.businessObject.id))
          allTasks.push(node.businessObject);
      }
    }

    allTasks = allTasks.sort((x, y) => {
      return x.orderingIndex - y.orderingIndex;
    });
    // console.log(allTasks)

    esd = JSON.parse(esd);
    let simpleDisclosureDataObjects = esd.simpleDisclosureDataObjects;
    let uniqueLanesAndPools = esd.uniqueLanesAndPools;
    let dataObjectGroupsMessageFlowConnections = esd.dataObjectGroupsMessageFlowConnections;
    let columns = simpleDisclosureDataObjects.length;
    let rows = uniqueLanesAndPools.length;

    let table = "";
    table += '<table class="table" style="text-align:center">';
    table += '<tr><th style="background-color:#f5f5f5; text-align:center;">#</th>';
    for (let c = 0; c < columns; c++) {
      table += '<th style="background-color:#f5f5f5; text-align:center; vertical-align: middle;">' + simpleDisclosureDataObjects[c].name + '</th>';
    }
    table += '</tr>';
    for (let r = 0; r < rows; r++) {
      table += '<tr><td style="background-color:#f5f5f5;"><b>' + uniqueLanesAndPools[r].name + '</b></td>';
      for (let c = 0; c < columns; c++) {
        let visibilityInfoExists = simpleDisclosureDataObjects[c].visibility.filter((obj) => {
          return obj.visibleTo == uniqueLanesAndPools[r].id;
        });
        if (visibilityInfoExists.length !== 0) {
          table += '<td class="dd-' + r + '-' + c + '">' + visibilityInfoExists[0].visibility + '</td>';
          if(visibilityInfoExists[0].visibility.indexOf('I') > -1 || 
             visibilityInfoExists[0].visibility.indexOf('D') > -1){
            $(document).off('click', '.dd-' + r + '-' + c);
            $(document).on('click', '.dd-' + r + '-' + c, (e) => {
              if (SimpleDisclosureAnalysis.SelectedTarget.simplificationDto) {
                $(document).find('.dd-' + SimpleDisclosureAnalysis.SelectedTarget.r + '-' + SimpleDisclosureAnalysis.SelectedTarget.c).css('background-color', 'white').css('color', 'black');
              }
              $(document).find('.dd-' + r + '-' + c).css('background-color', 'deepskyblue').css('color', 'white');
              SimpleDisclosureAnalysis.SelectedTarget.simplificationDto = allDtos.find(x => x.name == simpleDisclosureDataObjects[c].name);
              SimpleDisclosureAnalysis.SelectedTarget.c = c;
              SimpleDisclosureAnalysis.SelectedTarget.r = r;
  
              SimpleDisclosureAnalysis.findOutputDtoForLeaksWhen(messageFlows, allDtos, allTasks);
            });
          }
        } else {
          table += '<td>?</td>';
        }
      }
      table += '</tr>';
    }
    if (dataObjectGroupsMessageFlowConnections) {
      table += '<tr><td colspan="' + (columns + 1) + '"></td></tr><tr><td>Shared over</td>'
      for (let c2 = 0; c2 < columns; c2++) {
        let connectionInfo = dataObjectGroupsMessageFlowConnections.filter((obj) => {
          return obj.name == simpleDisclosureDataObjects[c2].name;
        });
        if (connectionInfo.length !== 0) {
          table += '<td>' + connectionInfo[0].type + '</td>';
        } else {
          table += '<td>-</td>';
        }
      }
      table += '</tr>';
    }
    table += '</table>';

    // $('#simple-legend').text('V = visible, H = hidden, O = owner, MF = MessageFlow, S = SecureChannel, D = direct, I = indirect');
    $('#simpleDisclosureReportModal').find('#report-table').html('').html(table);
    let processName = $('#fileName')[0].innerText.replace('.bpmn', '');
    $('#simpleDisclosureReportModal').find('#simpleDisclosureReportTitle').text(processName);
    $('#simpleDisclosureReportModal').find('#simpleDisclosureReportType').text(' - Extended simple disclosure analysis report');
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
            is(curPart.children[j].businessObject, 'bpmn:StartEvent') ||
            is(curPart.children[j].businessObject, 'bpmn:IntermediateCatchEvent')) &&
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
            if (!x.sourceRef[0].orderingIndex || node.businessObject.orderingIndex < x.sourceRef[0].orderingIndex)
              x.sourceRef[0].orderingIndex = node.businessObject.orderingIndex;
          });
        }
      }
    }
  }

  private static findOutputDtoForLeaksWhen(messageFlows, allDtos, allTasks) {
    // console.log(allDtos)
    let nextMessageFlows = messageFlows
      .filter(x => (x.source.participant.id == SimpleDisclosureAnalysis.SelectedTarget.simplificationDto.participant.id) &&
        x.source.orderingIndex >= SimpleDisclosureAnalysis.SelectedTarget.simplificationDto.orderingIndex);
    nextMessageFlows = nextMessageFlows.sort((a, b) => a.source.orderingIndex - b.source.orderingIndex);
    
    // console.log(nextMessageFlows)

    for (let i = 0; i < nextMessageFlows.length; i++) {
      let nextMessageFlow = nextMessageFlows[i];

      let sqlFlow = "";
      for (var j = 0; j < allTasks.length; j++) {
        let x = allTasks[j];
        if(!!x.sqlScript && 
          (x.participant.id == nextMessageFlow.target.participant.id && x.orderingIndex <= nextMessageFlow.target.orderingIndex || 
          (x.participant.id == nextMessageFlow.source.participant.id && x.orderingIndex <= nextMessageFlow.source.orderingIndex)))
          sqlFlow += x.sqlScript + '\n\n'
      }
      
      sqlFlow = sqlFlow.toLowerCase();

      // console.log(nextMessageFlow.target.orderingIndex)
      let outputDtos = allDtos.filter(x => x.name != 'parameters' && (x.participant.id == nextMessageFlow.target.participant.id) &&
        (x.orderingIndex >= nextMessageFlow.target.orderingIndex));
        // console.log("out dtos = ")
        // console.log(outputDtos)
      outputDtos = outputDtos
                    .sort((a, b) => a.orderingIndex - b.orderingIndex)
                    .filter(x => {
                      const regex = RegExp(`into ${x.name.split(' ').map(word => word.toLowerCase()).join('_')}\\s+from`);
                      // console.log(regex)
                      // console.log(sqlFlow)
                      const found = sqlFlow.match(regex);
                      return !!found;
                    })

      // console.log(sqlFlow)
      // console.log(outputDtos)
      if(outputDtos.length){
        let outputDto = outputDtos[0];
        SimpleDisclosureAnalysis.SelectedTarget.selectedTargetsForLeaksWhen.push(outputDto);
      }
    }
  }
}