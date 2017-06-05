export const Custom = {
  id: `pleak-pa-bpmn`,
  name: `Pleak PA-BPMN`,
  prefix: `pleak`,
  "uri": "http://pleak.io/",
};

export const SqlBPMNModdle = {
  name: Custom.name,
  prefix: Custom.prefix,
  uri: Custom.uri,
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
    }
  ]
};