/**
 * Deterministic CloudFormation skeleton for CXOS AWS plan-only deploy.
 * Strong graph: journey type + stages → fixed resource graph (no model).
 */
import type { JourneyMap } from "@cox/cx-core";

export function buildCfnSkeleton(opts: {
  specName: string;
  journeyType: string;
  journeyMap: JourneyMap;
}): { title: string; markdown: string; yaml: string } {
  const stackName = `cxos-${opts.specName}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 64);
  const stages = opts.journeyMap.stages.map((s) => s.id).join(", ");

  const yaml = `AWSTemplateFormatVersion: '2010-09-09'
Description: >
  CXOS plan-only stack for journey ${opts.journeyType}
  (spec ${opts.specName}). Human applies with scoped credentials.
  Stages: ${stages}

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
    Default: dev
  JourneyType:
    Type: String
    Default: ${opts.journeyType}
  SpecName:
    Type: String
    Default: ${opts.specName}

Resources:
  CxConnectInstance:
    Type: AWS::Connect::Instance
    Properties:
      IdentityManagementType: CONNECT_MANAGED
      InboundCallsEnabled: true
      OutboundCallsEnabled: true
      InstanceAlias: !Sub '\${SpecName}-\${Environment}'

  CxLexBot:
    Type: AWS::Lex::Bot
    Properties:
      Name: !Sub '\${SpecName}-bot'
      RoleArn: !GetAtt CxLexBotRole.Arn
      DataPrivacy:
        ChildDirected: false
      IdleSessionTTLInSeconds: 300
      # Intents mapped from CXOS ontology for ${opts.journeyType}

  CxLexBotRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lexv2.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/AmazonLexRunBotsOnly

  CxBedrockAgentRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: bedrock.amazonaws.com
            Action: sts:AssumeRole

  # Bedrock Agent is defined behaviorally in agentDefinition.json;
  # infrastructure binding is applied by the human operator.

Outputs:
  JourneyType:
    Value: !Ref JourneyType
  ConnectInstanceArn:
    Value: !GetAtt CxConnectInstance.Arn
  StackPurpose:
    Value: plan-only-cxos
  ApplyHint:
    Value: 'aws cloudformation deploy --template-file template.yaml --stack-name ${stackName} --capabilities CAPABILITY_IAM'
`;

  const title = `AWS CX stack for ${opts.journeyType}`;
  const markdown = [
    `# ${title}`,
    ``,
    `**Spec:** ${opts.specName}`,
    `**Journey:** ${opts.journeyType} (strong-graph bind)`,
    `**Mode:** plan-only — no live CreateStack from Coxswain`,
    ``,
    `## Stages`,
    ...opts.journeyMap.stages.map((s) => `- \`${s.id}\`: ${s.name}`),
    ``,
    `## Apply (human)`,
    "```bash",
    `aws cloudformation deploy \\`,
    `  --template-file .cox/cx/${opts.specName}/aws/template.yaml \\`,
    `  --stack-name ${stackName} \\`,
    `  --capabilities CAPABILITY_IAM`,
    "```",
    ``,
    `## Template`,
    "```yaml",
    yaml.trimEnd(),
    "```",
  ].join("\n");

  return { title, markdown, yaml };
}
