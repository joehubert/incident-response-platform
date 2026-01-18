/**
 * Teams message options
 */
export interface TeamsMessage {
  content: string;
  channelId?: string;
  teamId?: string;
  webhookUrl?: string;
}

/**
 * Teams adaptive card format (for future use)
 */
export interface AdaptiveCard {
  type: 'AdaptiveCard';
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
}

export interface AdaptiveCardElement {
  type: string;
  text?: string;
  weight?: string;
  size?: string;
  color?: string;
  items?: AdaptiveCardElement[];
}

export interface AdaptiveCardAction {
  type: string;
  title: string;
  url?: string;
}

/**
 * Teams send result
 */
export interface TeamsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
