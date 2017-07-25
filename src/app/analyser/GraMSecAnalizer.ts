const is = (element: any, type: any) => element.$instanceOf(type);

let transitiveClosure = (adjList: {[src: string]: Array<string>}, sources: Array<string>): {[src: string]: Array<string>} => {

  var transClosure = {};

  for (var source of sources) {

    var visited = new Array(), open = new Array();
    open.push(source);

    while (open.length > 0) {

      var curr = open.pop();
      visited.push(curr);

      if (adjList[curr]) {

        for (var succ of adjList[curr]) {

          if (visited.indexOf(succ) < 0 && open.indexOf(succ) < 0) {

            open.push(succ);

          }

        }

      }

    }

    transClosure[source] = visited;

  }

  return transClosure;

}

export let topologicalSorting = (adjList: {[src: string]: Array<string>}, invAdjList: {[src: string]: Array<string>}, sources: Array<string>): Array<string> => {

  var order = new Array();
  var sourcesp = sources.slice(0);
  var invAdjListp = {};

  for (let key in invAdjList) {

    invAdjListp[key] = invAdjList[key].slice(0);

  }

  while (sourcesp.length > 0) {

    var n = sourcesp.pop();
    order.push(n);

    if (adjList[n]) {

      for (var _m in adjList[n]) {

        var m = adjList[n][_m];
        invAdjListp[m].splice(invAdjListp[m].indexOf(n), 1);

        if (invAdjListp[m].length == 0) {

          sourcesp.push(m);

        }

      }

    }

  }

  return order;

}

export let dataFlowAnalysis = (process: any, registry: any): any => {

  var sources: Array<string>;
  var dataFlowEdges: {[src: string]: Array<string>} = {};
  var invDataFlowEdges: {[src: string]: Array<string>} = {};
  var processingNodes: Array<string> = [];

  for (let node of process.flowElements.filter((e:any) => is(e, "bpmn:Task"))) {

    if (node.dataInputAssociations && node.dataInputAssociations.length > 0 && node.dataOutputAssociations && node.dataOutputAssociations.length > 0) {

      if (!dataFlowEdges[node.id]) dataFlowEdges[node.id] = [];
      if (!invDataFlowEdges[node.id]) invDataFlowEdges[node.id] = [];

      processingNodes.push(node.id);

      for (let association of node.dataInputAssociations) {

        let pred = association.sourceRef[0];

        if (!dataFlowEdges[pred.id]) dataFlowEdges[pred.id] = [];

        dataFlowEdges[pred.id].push(node.id);
        invDataFlowEdges[node.id].push(pred.id);

      }

      for (let association of node.dataOutputAssociations) {

        let succ = association.targetRef;

        if (!invDataFlowEdges[succ.id]) invDataFlowEdges[succ.id] = [];

        dataFlowEdges[node.id].push(succ.id);
        invDataFlowEdges[succ.id].push(node.id);

      }

    }

  }

  sources = Object.keys(dataFlowEdges).filter( (e, i, a) => !invDataFlowEdges[e] && a.indexOf(e) >= 0 );

  return {
    sources: sources,
    dataFlowEdges: dataFlowEdges,
    invDataFlowEdges: invDataFlowEdges,
    processingNodes: processingNodes
  }

}

export let computeSensitivitiesMatrix = (process: any, registry: any): [any, any, any] => {

  var info = dataFlowAnalysis(process, registry);
  let [processingNodes, dataFlowEdges, invDataFlowEdges, sources] = [info.processingNodes, info.dataFlowEdges, info.invDataFlowEdges, info.sources];

  let [Dinputs, tmp1, tmp2] = computeGraMSecMatrices(process, registry);

  let Ds = [];
  let ls = [];
  let matrix = [];

  // Add sensitivites from analyser into Ds array (relations only between inputs and outputs)
  for (var input in Dinputs) {
    if (Dinputs.hasOwnProperty(input)) {
      for (var output in Dinputs[input]) {
        if (Dinputs[input].hasOwnProperty(output)) {
          let sameElements = Ds.filter(function( obj ) {
            return obj.input == input && obj.output == output && obj.value == Dinputs[input][output];
          });
          if (sameElements.length == 0) {
            Ds.push({input: input, output: output, value: Dinputs[input][output]});
          }
        }
      }
    }
  }

  // Add other sensitivities into Ds array (relations only between inputs themselves)
  for (let source of sources) {
    for (let source2 of sources) {
      let outp;
      if (source == source2) {
        // D[input,input] = 1
        outp = {input: source, output: source, value: 1};
      } else {
        // D[input1, input2] = 0 (if not specified differently)
        outp = {input: source, output: source2, value: 0};
      }
      let sameElements = Ds.filter(function( obj ) {
        return obj.input == source && obj.output == source2;
      });
      if (sameElements.length == 0) {
        Ds.push(outp);
      }
    }
  }

  for (let node of process.flowElements.filter((e:any) => is(e, "bpmn:Task"))) {

    if (processingNodes.indexOf(node.id) >= 0 && node.sensitivityMatrix) {

      node.nSensitivityMatrixJSON = JSON.parse(node.sensitivityMatrix);
      let object = node.nSensitivityMatrixJSON;

      // Add ensitivities from analyser into ls array (all relations)
      for (var input in object) {
        if (object.hasOwnProperty(input)) {
          for (var output in object[input]) {
            if (object[input].hasOwnProperty(output)) {
              ls.push({input: input, output: output, value: object[input][output]});
            }
          }
        }
      }

    }

  }

  // Calculate sensitivity values (sum of multiple multiplications) for the result matrix
  for (let source of sources) {
    for (let target of Object.keys(invDataFlowEdges).filter((e:any) => processingNodes.indexOf(e) < 0)) {
      let value = 0;

      let targets = ls.filter(function( obj ) {
        return obj.output == target;
      });
      if (targets.length > 0) {
        for (let tar of targets) {

          // First value of the multiplication
          let values1 = Ds.filter(function( obj ) {
            return obj.input == source && obj.output == tar.input;
          });
          let val1 = values1[0].value;

          // Second value of the multiplication
          let values2 = ls.filter(function( obj ) {
            return obj.input == tar.input && obj.output == target;
          });

          let val2 = values2[0].value;

          let preval;

          if (val1 == -1 && val2 == 1) {
            preval = Infinity;
          } else if (val1 == -1 && val2 == 0) {
            preval = 0;
          } else if (val1 == 1 && val2 == -1) {
            preval = Infinity;
          } else if (val1 == 0 && val2 == -1) {
            preval = 0;
          } else {
            preval = val1 * val2;
          }

          // Sensitivity value for the matrix (sum of multiplications)
          if (value == Infinity || preval == Infinity) {
            value = Infinity;
          } else {
            value += preval;
          }

        }
      }

      // Add calculated value to the Ds array to calculate next sensitivities
      Ds.push({input: source, output: target, value: value})

      // Add calculated value to the result matrix
      matrix.push({input: source, output: target, value: value})

    }
  }

  var dc = {};

  // Format matrix for the result modal
  for (let input of sources) {
    let targets = matrix.filter(function( obj ) {
      return obj.input == input;
    });
    if (targets.length > 0) {
      let obj = {}
      for (let i = 0; i < targets.length; i++) {
        obj[targets[i].output] = targets[i].value;
      }
      dc[input] = obj;
    }
  }

  return [dc, sources, Object.keys(invDataFlowEdges).filter((e:any) => processingNodes.indexOf(e) < 0)];

}

export let computeGraMSecMatrices = (process: any, registry: any): [any, any, any] => {

  // console.log("Analyzing", process);
  var info = dataFlowAnalysis(process, registry);
  let [processingNodes, dataFlowEdges, invDataFlowEdges, sources] = [info.processingNodes, info.dataFlowEdges, info.invDataFlowEdges, info.sources];

  for (let node of process.flowElements.filter((e:any) => is(e, "bpmn:Task"))) {

    if (processingNodes.indexOf(node.id) >= 0 && node.sensitivityMatrix) {

      node.nSensitivityMatrixJSON = JSON.parse(node.sensitivityMatrix);

    }

  }

  let order = topologicalSorting(dataFlowEdges, invDataFlowEdges, sources);
  let transClosure = transitiveClosure(dataFlowEdges, sources);

  var dc = {};

  for (let p of order) {

    let node = registry.get(p).businessObject;

    if (!is(node, "bpmn:DataObjectReference")) {

      //console.log(`About to process: ${node.name}`);
      for (let source of sources) {

        let nsource = registry.get(source).businessObject;

        //console.log('--------------');
        //console.log(`Source: ${nsource.name}`);
        if (transClosure[source].indexOf(p) < 0) continue;

        //console.log(`Source: ${nsource.name}`);
        //console.log('..');
        for (let pred of invDataFlowEdges[p]) {

          let npred = registry.get(pred).businessObject;

          if (transClosure[source].indexOf(pred) < 0) continue;

          //console.log(`Predecessor: ${npred.name}`);
          for (let succ of dataFlowEdges[p]) {

            let nsucc = registry.get(succ).businessObject;

            if (transClosure[source].indexOf(succ) < 0) continue;

            //console.log(`Successor: ${nsucc.name}`);

            if (node.nSensitivityMatrixJSON) {

              let value =  node.nSensitivityMatrixJSON[pred][succ];
              value = value >= 0 ? value : Infinity;

              if (source === pred) {

                var map2 = dc[pred] || {};
                map2[succ] = value;
                dc[pred] = map2;

              }

            }

          }

        }

      }

    }

  }

  return [dc, sources, Object.keys(invDataFlowEdges).filter((e:any) => processingNodes.indexOf(e) < 0)];

}