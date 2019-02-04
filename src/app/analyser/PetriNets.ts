let is = (element, type) => element.$instanceOf(type);

export class PetriNets {
  
  // To refresh the state of diagram and be able to run analyser again
  public static removePetriMarks(registry) {
    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if (node['petriPlace']) {
        delete node['petriPlace'];
      }
      if (node['isProcessed']) {
        delete node['isProcessed'];
      }
      if (node['stackImage']) {
        delete node['stackImage'];
      }
      if (!!node.businessObject) {
        if (node.businessObject['petriPlace']) {
          delete node.businessObject['petriPlace'];
        }
        if (node.businessObject['isProcessed']) {
          delete node.businessObject['isProcessed'];
        }
        if (node.businessObject['stackImage']) {
          delete node.businessObject['stackImage'];
        }
      }
    }
  }

  public static buildPetriNet(registry, startBusinessObj, petri, maxPlaceNumberObj, taskDtoOrdering) {
    let currentRun = [];
    let st = [startBusinessObj];
    let xorSplitStack = [];

    while (st.length > 0) {
      let curr = st.pop();
      currentRun.push(curr);

      let inc = curr.incoming ? curr.incoming.map(x => x.sourceRef) : null;
      let out = curr.outgoing ? curr.outgoing.map(x => x.targetRef) : null;

      if (curr.outgoing && curr.$type != "bpmn:DataObjectReference") {
        curr.outgoing.forEach(x => {
          var name = curr.id;
          if (!is(curr, 'bpmn:StartEvent')) {
            name = x.petriPlace ? x.petriPlace : "p" + maxPlaceNumberObj.maxPlaceNumber++;
          }

          if (is(x.targetRef, 'bpmn:EndEvent')) {
            name = x.targetRef.id;
          }

          x.petriPlace = name;

          if (!petri[name]) {
            petri[name] = { out: [], type: "place" };
          }
        });
      }

      if (curr.$type == "bpmn:DataObjectReference") {
        petri[curr.id] = {
          out: out.length ? out.map(x => x.id) : [],
          type: "place"
        };
      }

      if (curr.outgoing && curr.incoming && !curr.isProcessed) {
        var ident = curr.id;
        if (curr.$type == "bpmn:ParallelGateway") {
          ident = ident.replace("Exclusive", "Parallel");
        }

        if (!petri[ident]) {
          petri[ident] = {
            out: curr.outgoing.map(x => x.petriPlace),
            type: "transition"
          };
        }
        else {
          petri[ident].out = petri[ident].out.concat(curr.outgoing.map(x => x.petriPlace));
        }

        curr.incoming.forEach(x => {
          if (x.petriPlace && !petri[x.petriPlace].out.find(z => z == ident)) {
            petri[x.petriPlace].out.push(ident);
          }
        });

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
          // st.push(out[0]);
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
      if (is(node.businessObject, 'bpmn:Task') && petri[node.id]) {
        taskDtoOrdering[node.id] = [];
        petri[node.id].label = node.businessObject.name;

        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          node.businessObject.dataInputAssociations.forEach(x => {
            // We attach initial data objects with 'create' statements to the first
            // task of current lane and ignore if there are multiple output associations
            // because of petri net logic
            if(!!x.sourceRef[0].sqlScript && x.sourceRef[0].$parent.id == startBusinessObj.$parent.id) {
              let startEventOut = startBusinessObj.outgoing ? startBusinessObj.outgoing.map(x => x.targetRef) : null;
              if(!!startEventOut) {
                petri[x.sourceRef[0].id] = { type: "place", out: [startEventOut[0].id], label: x.sourceRef[0].name }
              }
            }
          });
        }

        if (node.businessObject.dataOutputAssociations && node.businessObject.dataOutputAssociations.length) {
          node.businessObject.dataOutputAssociations.forEach(x => {
            if(!!x.targetRef.sqlScript) {
              if (petri[node.id].out.findIndex(y => y == x.targetRef.id) == -1)
                petri[node.id].out.push(x.targetRef.id);
              if (!petri[x.targetRef.id]) {
                petri[x.targetRef.id] = { type: "place", out: [], label: x.targetRef.name }
              }
            }

            taskDtoOrdering[node.id].push(x.targetRef.id);
          });
        }
      }
    }

    // Handling message flow
    for (var i in registry._elements) {
      var node = registry._elements[i].element;
      if (node.type == "bpmn:MessageFlow" && !node.isProcessed) {
        var source = node.businessObject.sourceRef;
        var target = node.businessObject.targetRef;

        // New place for message flow
        var newId = "";
        // In case of message flow to start event in another lane
        // we don't need a new place, because start event is already a place
        if (is(target, 'bpmn:StartEvent')) {
          newId = target.id;
        }
        else {
          newId = "p" + maxPlaceNumberObj.maxPlaceNumber++;
          petri[newId] = { type: "place", out: [target.id], label: newId }
        }

        if (!petri[source.id]) {
          petri[source.id] = { type: "transition", out: [newId], label: source.name }
        }
        else {
          petri[source.id].out.push(newId);
        }

        node.isProcessed = true;
      }
    }

    return petri;
  }

  public static preparePetriNetForServer(petriNet) {
    function onlyUnique(value, index, self) {
      return self.indexOf(value) === index;
    }

    for (var el in petriNet) {
      petriNet[el].out = petriNet[el].out.filter(onlyUnique);
    }

    // Removing redundant nodes before/after xor gateway 
    // (because XOR state is not carrying logic so we can connect preceeding node directly to the following)
    for (var el in petriNet) {
      if (el.includes("ExclusiveGateway")) {
        var copies = 0;

        if (petriNet[el].out.length > 1) {

          var preceedingNode = Object.values(petriNet).find(x => !!x["out"].find(z => z == el));
          preceedingNode["out"] = [];
          for (var i = 0; i < petriNet[el].out.length; i++) {
            copies++;
            var copy = el + i;
            preceedingNode["out"].push(copy);
            petriNet[copy] = { type: petriNet[el].type, out: [petriNet[el].out[i]] };
          }
        }
        else {
          var preceedings = Object.values(petriNet).filter(x => !!x["out"].find(z => z == el));
          for (var i = 0; i < preceedings.length; i++) {
            copies++;
            var copy = el + i;
            preceedings[i]["out"] = [copy];
            petriNet[copy] = { type: petriNet[el].type, out: [petriNet[el].out[0]] };
          }
        }

        delete petriNet[el];

        // for(var el2 in petri) {
        //   var oldIdIndex = petri[el2].out.indexOf(x => x == el);
        //   if(oldIdIndex != -1) {
        //     petri[el2].out[oldIdIndex] = petri[el2].out[oldIdIndex] + copies;
        //   }
        // }
      }
    }

    // Additional data for server analyzer
    for (var el in petriNet) {
      if (petriNet[el].type == "place") {
        var isInputFound = false;
        for (var el2 in petriNet) {
          if (petriNet[el2].out.findIndex(x => x == el) != -1) {
            isInputFound = true;
            break;
          }
        }

        petriNet[el].isInputFound = isInputFound;
      }
    }

    // Translating to dot format to check how the net looks

    // var str = "digraph G { rankdir=LR; ";
    // for (var el in petri) {
    //   if (petri[el].type == "transition") {
    //     str += el + ' [shape=box,label="' + (petri[el].label ? petri[el].label : el) + '"]; ';
    //   }
    //   else {
    //     str += el + ' [label="' + (petri[el].label ? petri[el].label : el) + '"]; ';
    //   }
    // }

    // for (var el in petri) {
    //   petri[el].out.forEach(x => {
    //     str += el + " -> " + x + "; ";
    //   });
    // }

    // str += " }";

    // str = str.replace(/[^\x20-\x7E]/g, '');
    // console.log(str);
  }

}