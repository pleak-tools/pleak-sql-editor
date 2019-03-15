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
        "bpmn:Task",
        "bpmn:StartEvent",
        "bpmn:IntermediateCatchEvent"
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
      name: "Policies",
      extends: [
        "bpmn:Participant"
      ],
      properties: [
        {
          "name": "policyScript",
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
          "name": "SGXProtect",
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
          "name": "GCComputation",
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
        },
        {
          "name": "DifferentialPrivacy",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "ProtectConfidentiality",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "OpenConfidentiality",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "PETComputation",
          "isAttr": false,
          "type": "String"
        }
      ]
    },
    {
      name: "SQLDerivativeSensitivityTask",
      extends: [
        "bpmn:Task"
      ],
      properties: [
        {
          "name": "sqlTaskInfo",
          "isAttr": false,
          "type": "String"
        },
      ]
    },
    {
      name: "SQLDataObjectReference",
      extends: [
        "bpmn:DataObjectReference",
        "bpmn:DataStoreReference",
      ],
      properties: [
        {
          "name": "sqlScript",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "tableData",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "attackerSettings",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "policyScript",
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
        },
        {
          "name": "CommunicationProtection",
          "isAttr": false,
          "type": "String"
        }
      ]
    },
    {
      name: "StereotypeDataObjectReference",
      extends: [
        "bpmn:DataObjectReference",
        "bpmn:DataStoreReference"
      ],
      properties: [
        {
          "name": "PKPublic",
          "isAttr": false,
          "type": "String"
        },
        {
          "name": "PKPrivate",
          "isAttr": false,
          "type": "String"
        }
      ]
    },
    {
      name: "SQLDerivativeSensitivityDataObjectReference",
      extends: [
        "bpmn:DataObjectReference",
        "bpmn:DataStoreReference"
      ],
      properties: [
        {
          "name": "sqlDataObjectInfo",
          "isAttr": false,
          "type": "String"
        }
      ]
    },
    {
      name: "PolicyProcess",
      extends: [
        "bpmn:Process"
      ],
      properties: [
        {
          "name": "policyInfo",
          "isAttr": false,
          "type": "String"
        }
      ]
    }
  ]
};