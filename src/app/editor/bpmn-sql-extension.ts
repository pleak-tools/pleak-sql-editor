export const SqlBPMNModdle = {
  name: 'Pleak PA-BPMN & PE-BPMN',
  prefix: 'pleak',
  uri: 'http://pleak.io/',
  xml: {
    tagAlias: "lowerCase"
  },
  associations: new Array(),
  types: [
    {
      name: "SQLTask",
      extends: [
        "bpmn:Task"
      ],
      properties: [
        {
          "name": "sqlScript",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "sensitivityMatrix",
          "isAttr": false,
          "type": "String"
        }
      ]
    },
    {
      name: "SQLDataObjectReference",
      extends: [
        "bpmn:DataObjectReference"
      ],
      properties: [
        {
          "name": "sqlScript",
          "isAttr": false,
          "type": "String"
        }
      ]
    },
    {
      name: "StereotypeTask",
      extends: [
        "bpmn:Task"
      ],
      properties: [
        {
          "name": "PKEncrypt",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "PKDecrypt",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "PKComputation",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "MPC",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SKEncrypt",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SKDecrypt",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SKComputation",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SSSharing",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SSComputation",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SSReconstruction",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "AddSSSharing",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "AddSSComputation",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "AddSSReconstruction",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "FunSSSharing",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "FunSSComputation",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "FunSSReconstruction",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SGXComputation",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SGXAttestationEnclave",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SGXAttestationChallenge",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SGXQuoting",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "SGXQuoteVerification",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "DimensionalityReduction",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "GCGarble",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "GCEvaluate",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "OTSend",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "OTReceive",
          "isAttr": false,
          "type": "String"
        }
      ]
    },
    {
      name: "StereotypeMessageFlow",
      extends: [
        "bpmn:MessageFlow"
      ],
      properties: [
        {
          "name": "SecureChannel",
          "isAttr": false,
          "type": "String"
        }
      ]
    }
  ]
};