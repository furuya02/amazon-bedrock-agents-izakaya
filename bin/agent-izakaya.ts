#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AgentIzakayaStack } from "../lib/agent-izakaya-stack";

const app = new cdk.App();
new AgentIzakayaStack(app, "AgentIzakayaStack", {
});
