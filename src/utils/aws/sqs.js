import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { traceAction } from '@/utils/tracing';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const QUEUE_URL = process.env.AWS_SQS_QUEUE_URL;
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
    console.error("Error sending message to SQS:", error);
    throw error;
  }
});
