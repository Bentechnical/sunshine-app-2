'use client';

import React, { useRef, useEffect } from 'react';
import {
  TextareaComposer,
  QuotedMessagePreview,
  AttachmentPreviewList,
  SendButton,
  useMessageInputContext,
  useChannelActionContext,
} from 'stream-chat-react';
import type { MessageInputProps } from 'stream-chat-react';

export default function IOSKeyboardInput(props: MessageInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { handleSubmit } = useMessageInputContext();
  const { sendMessage } = useChannelActionContext();

  // Wrapper to match SendButton expected signature
  const handleSendMessage = (event: React.BaseSyntheticEvent) => {
    event.preventDefault();
    handleSubmit(event);
  };

  // Custom iOS keyboard handling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Detect iOS specifically
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (!isIOS) return;

    // Add iOS-specific class for styling
    container.classList.add('ios-keyboard-input');

    // Handle focus/blur to manage keyboard behavior
    const handleFocus = () => {
      // Scroll input into view on iOS
      setTimeout(() => {
        container.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest' 
        });
      }, 300);
    };

    const textarea = container.querySelector('textarea');
    if (textarea) {
      textarea.addEventListener('focus', handleFocus);
      
      // Cleanup
      return () => {
        textarea.removeEventListener('focus', handleFocus);
      };
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      className="ios-custom-input flex items-center gap-2 p-3 bg-white border-t border-gray-200"
    >
      {/* Quoted message preview above input */}
      <div className="w-full">
        <QuotedMessagePreview />
        <AttachmentPreviewList />
        
        {/* Main input row */}
        <div className="flex items-center gap-2">
          {/* Textarea composer with iOS optimizations */}
          <div className="flex-1 min-w-0">
            <TextareaComposer
              className="ios-textarea-composer"
              placeholder="Type a message..."
              maxRows={4}
              minRows={1}
              onFocus={(e) => {
                // Prevent iOS Safari zoom on input focus
                const target = e.target as HTMLTextAreaElement;
                if (target.style.fontSize !== '16px') {
                  target.style.fontSize = '16px';
                }
              }}
              shouldSubmit={(event) => {
                // Custom submit logic for iOS
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                  return true;
                }
                return false;
              }}
            />
          </div>
          
          {/* Send button */}
          <div className="flex-shrink-0">
            <SendButton sendMessage={handleSendMessage} />
          </div>
        </div>
      </div>
    </div>
  );
}