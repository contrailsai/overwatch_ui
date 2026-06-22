import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { traceAction } from '@/utils/tracing';
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const QUEUE_URL = process.env.AWS_SQS_QUEUE_URL;
const REPORT_QUEUE_URL = process.env.AWS_REPORT_GENERATION_SQS;
const CONTENT_MODERATION_SQS_QUEUE_URL = process.env.AWS_CONTENT_MODERATION_SQS_QUEUE_URL;

/**
 * Sends a message to the SQS queue for link ingestion.
 * @param {Object} messageBody - The payload to send to SQS.
 * @returns {Promise<Object>} - The response from SQS.
 */
export const sendSqsMessage = traceAction('sendSqsMessage', async (messageBody) => {
  const command = new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(messageBody),
  });

  try {
    const response = await sqsClient.send(command);
    return response;
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/sqs',
      app_action: 'sendSqsMessage',
      message: 'Error sending message to SQS',
    }, error)
    console.error("Error sending message to SQS:", error);
    throw error;
  }
});

/**
 * Sends a message to the SQS queue for report generation.
 * @param {Object} messageBody - The payload to send to SQS.
 * @returns {Promise<Object>} - The response from SQS.
 */
export const sendReportSqsMessage = traceAction('sendReportSqsMessage', async (messageBody) => {
  const command = new SendMessageCommand({
    QueueUrl: REPORT_QUEUE_URL,
    MessageBody: JSON.stringify(messageBody),
  });

  try {
    const response = await sqsClient.send(command);
    return response;
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/sqs',
      app_action: 'sendReportSqsMessage',
      message: 'Error sending report message to SQS',
    }, error)
    console.error("Error sending report message to SQS:", error);
    throw error;
  }
});

/**
 * Sends a message to the SQS queue for content moderation (AI analysis).
 * @param {string} db_name
 * @param {string} collection_name
 * @param {string} object_id
 * @param {{ mode?: 'revision', correction_request_id?: string }} [options] - Omit for legacy full re-run (3-field payload only).
 * @returns {Promise<Object|null>} - The response from SQS, or null if queue not configured.
 */
export const sendContentModerationSqsMessage = traceAction('sendContentModerationSqsMessage', async (db_name, collection_name, object_id, options) => {
  if (!CONTENT_MODERATION_SQS_QUEUE_URL) {
    console.log("AWS_CONTENT_MODERATION_SQS_QUEUE_URL not configured.");
    return null;
  }

  const messageBody = {
    db_name,
    collection_name,
    object_id,
  };

  if (options?.mode === 'revision' && options.correction_request_id) {
    messageBody.mode = 'revision';
    messageBody.correction_request_id = options.correction_request_id;
  }

  const command = new SendMessageCommand({
    QueueUrl: CONTENT_MODERATION_SQS_QUEUE_URL,
    MessageBody: JSON.stringify(messageBody),
  });

  try {
    const response = await sqsClient.send(command);
    return response;
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/sqs',
      app_action: 'sendContentModerationSqsMessage',
      message: 'Error sending message to content moderation queue',
    }, error)
    console.error("Error sending message to content moderation queue:", error);
    throw error;
  }
});

