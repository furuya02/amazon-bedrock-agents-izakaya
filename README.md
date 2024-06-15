## setup


```
% git clone https://github.com/furuya02/amazon-bedrock-agents-izakaya.git
% cd amazon-bedrock-agents-izakaya
% npm i
```

## cdk.json 編集
cdk.jsonで、Pineconeのエンドポイント及び、接続情報を設定してください

```
"context": {
    "pineconeEndpoint": "https://xxxxxxx.pinecone.io",
    "pineconeSecretArn": "arn:aws:secretsmanager:us-east-1:xxxxxxxx",
```

## CDKデプロイ

```
% export AWS_DEFAULT_REGION=us-east-1
% npx cdk diff
% npx cdk deploy
```

## データアップロード

assetsのテキスト及び、PDFをS3へアップロードしてください

```
% aws s3 cp assets/izakaya_guidance.pdf s3://agent-izakaya-xxxxxxxxxxxx/izakaya_guidance.pdf
% aws s3 cp assets/izakaya_menu.txt s3://agent-izakaya-xxxxxxxxxxxx/izakaya_menu.txt
```

## 削除
1. S3バケットにコピーしたizakaya_guidance.pdf及び、izakaya_menu.txtを削除
2. CDK destory
```
% cd amazon-bedrock-kb-izakaya
% npm i
% npx cdk destroy
```

## ブログ
詳しくは、下記のブログをご参照ください。

