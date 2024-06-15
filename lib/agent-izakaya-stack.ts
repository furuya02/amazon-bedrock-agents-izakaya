import fs = require("fs");
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_s3 as s3 } from "aws-cdk-lib";
import { aws_bedrock as bedrock } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";

export class AgentIzakayaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tag = "agent-izakaya";
    const bucketName = `${tag}-${this.account}`;
    const functionName = `${tag}-function`;
    const embeddingModel = this.node.tryGetContext("embeddingModel");
    const foundationModel = this.node.tryGetContext("foundationModel");
    const pineconeEndpoint = this.node.tryGetContext("pineconeEndpoint");
    const pineconeSecretArn = this.node.tryGetContext("pineconeSecretArn");

    // S3 bucket for the data source
    const dataSourceBucket = new s3.Bucket(this, "DataSourceBucket", {
      bucketName: bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // const dataSourceBucket = aws_s3.Bucket.fromBucketName(this, "DataSourceBucket", bucketName);

    ///////////////////////////////////////////////////////////////////////
    // KnowledgeBase for Amazon Berock
    ///////////////////////////////////////////////////////////////////////
    const knowledgeBaseRole = new iam.Role(this, `KnowledgeBaseRole`, {
      roleName: `${tag}_kb-role`,
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      inlinePolicies: {
        inlinePolicy1: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: [pineconeSecretArn],
              actions: ["secretsmanager:GetSecretValue"],
            }),
            new iam.PolicyStatement({
              resources: [`arn:aws:bedrock:${this.region}::foundation-model/${embeddingModel}`],
              actions: ["bedrock:InvokeModel"],
            }),
            new iam.PolicyStatement({
              resources: [`arn:aws:s3:::${bucketName}`, `arn:aws:s3:::${bucketName}/*`],
              actions: ["s3:ListBucket", "s3:GetObject"],
            }),
          ],
        }),
      },
    });
    const knowledgeBase = new bedrock.CfnKnowledgeBase(this, "KnowledgeBase", {
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/${embeddingModel}`,
        },
      },
      name: tag,
      roleArn: knowledgeBaseRole.roleArn,
      storageConfiguration: {
        type: "PINECONE",
        pineconeConfiguration: {
          connectionString: pineconeEndpoint,
          credentialsSecretArn: pineconeSecretArn,
          fieldMapping: {
            metadataField: "metadata",
            textField: "text",
          },
        },
      },
      description: "IZAKAYA knowledge base",
    });
    new bedrock.CfnDataSource(this, "BedrockKnowledgeBaseDataStore", {
      name: `${tag}-data-source`,
      knowledgeBaseId: knowledgeBase.ref,
      dataSourceConfiguration: {
        s3Configuration: {
          bucketArn: dataSourceBucket.bucketArn,
        },
        type: "S3",
      },
    });

    ///////////////////////////////////////////////////////////////////////
    // Lambda
    ///////////////////////////////////////////////////////////////////////
    const reservationFunctionRole = new iam.Role(this, "LambdaFunctionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
    });

    const reservationFunction = new lambda.Function(this, "LambdaFunction", {
      functionName: functionName,
      code: lambda.Code.fromAsset(`lambda/${functionName}`),
      handler: "index.handler",
      timeout: cdk.Duration.seconds(30),
      role: reservationFunctionRole,
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        TZ: "Asia/Tokyo",
      },
    });

    ///////////////////////////////////////////////////////////////////////
    // Actions for Amazon Berock
    ///////////////////////////////////////////////////////////////////////
    const agentsRole = new iam.Role(this, "AgentRole", {
      roleName: `${tag}_agents_role`,
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      inlinePolicies: {
        agentPoliciy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["bedrock:InvokeModel"],
              resources: [`arn:aws:bedrock:${this.region}::foundation-model/${foundationModel}`],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["bedrock:Retrieve"],
              resources: [knowledgeBase.attrKnowledgeBaseArn],
            }),
          ],
        }),
      },
    });

    const instructionText = new TextDecoder("utf-8").decode(fs.readFileSync("assets/instruction.txt"));
    const bedrockAgents = new bedrock.CfnAgent(this, "BedrockAgents", {
      agentName: `${tag}`,
      description: "agent izakaya",
      agentResourceRoleArn: agentsRole.roleArn,
      foundationModel: foundationModel, //"anthropic.claude-v2:1",
      instruction: instructionText,
      knowledgeBases: [
        {
          description: "居酒屋案内のナレッジベース",
          knowledgeBaseId: knowledgeBase.ref,
          knowledgeBaseState: "ENABLED",
        },
      ],
      actionGroups: [
        {
          actionGroupName: "reservationActionGroup",
          description: "予約API",
          actionGroupState: "ENABLED",
          functionSchema: {
            functions: [
              {
                name: "reserve",
                description: "予約API",
                parameters: {
                  date: {
                    type: "string",
                    description: "予約日",
                    required: true,
                  },
                  hour: {
                    type: "integer",
                    description: "予約時間",
                    required: true,
                  },
                  numberOfPeople: {
                    type: "integer",
                    description: "予約人数",
                    required: true,
                  },
                },
              },
            ],
          },
          actionGroupExecutor: {
            lambda: reservationFunction.functionArn,
          },
        },
      ],
    });

    ///////////////////////////////////////////////////////////////////////
    // Resource-Based Policy Statements
    ///////////////////////////////////////////////////////////////////////
    const principal = new iam.ServicePrincipal("bedrock.amazonaws.com", {
      conditions: {
        ArnLike: {
          "aws:SourceArn": bedrockAgents.attrAgentArn,
        },
      },
    });
    reservationFunction.grantInvoke(principal);

    ///////////////////////////////////////////////////////////////////////
    // Output the AWS CLI command to upload a file to the S3 bucket
    ///////////////////////////////////////////////////////////////////////
    const dataSourceFiles: string[] = ["izakaya_menu.txt", "izakaya_guidance.pdf"];
    dataSourceFiles.forEach((dataSourceFile) => {
      const uploadCommand = `aws s3 cp assets/${dataSourceFile} s3://${bucketName}/${dataSourceFile}`;
      new CfnOutput(this, `UploadCommand_${dataSourceFile}`, {
        value: uploadCommand,
        description: `AWS CLI command to upload a file to the S3 bucket`,
      });
    });
  }
}
