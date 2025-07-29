#!/bin/bash
cd /home/kavia/workspace/code-generation/flowcode-executor-48224-48245/flow_executor_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

