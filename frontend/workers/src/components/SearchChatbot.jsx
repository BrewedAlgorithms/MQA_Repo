import React, { useState, useEffect, useRef } from 'react';
import { useWorkflow } from '../context/WorkflowContext';

export default function SearchChatbot({ isOpen, onClose }) {
  const { workflowSteps, currentStepId, stationName } = useWorkflow();
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [visibleStepCount, setVisibleStepCount] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const hasAnimatedRef = useRef(false);

  // Reset state when panel opens/closes
  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setVisibleStepCount(0);
      hasAnimatedRef.current = false;

      // Start the welcome sequence after a brief pause
      const welcomeTimer = setTimeout(() => {
        setMessages([{
          id: 'welcome',
          type: 'bot',
          content: `Welcome to the SOP Assistant for **${stationName || 'this station'}**. I can help you navigate through the workflow steps, answer questions about procedures, and provide guidance.`,
          timestamp: new Date(),
        }]);

        // Then pop steps one by one
        if (workflowSteps.length > 0 && !hasAnimatedRef.current) {
          hasAnimatedRef.current = true;
          popStepsSequentially();
        }
      }, 400);

      // Focus input
      setTimeout(() => inputRef.current?.focus(), 500);

      return () => clearTimeout(welcomeTimer);
    } else {
      setMessages([]);
      setVisibleStepCount(0);
      hasAnimatedRef.current = false;
    }
  }, [isOpen, stationName]);

  // Pop steps one by one
  const popStepsSequentially = () => {
    setShowTypingIndicator(true);

    const introTimer = setTimeout(() => {
      setMessages(prev => [...prev, {
        id: 'steps-intro',
        type: 'bot',
        content: `Here are the **${workflowSteps.length} steps** for the current workflow:`,
        timestamp: new Date(),
      }]);

      // Pop each step with a delay
      workflowSteps.forEach((step, index) => {
        setTimeout(() => {
          setVisibleStepCount(index + 1);
          if (index === workflowSteps.length - 1) {
            setShowTypingIndicator(false);
            // Add a finishing message
            setTimeout(() => {
              setMessages(prev => [...prev, {
                id: 'steps-done',
                type: 'bot',
                content: `You're currently on **Step ${currentStepId}**. Type a question or use the mic to ask about any step.`,
                timestamp: new Date(),
              }]);
            }, 600);
          }
        }, (index + 1) * 350);
      });
    }, 800);

    return () => clearTimeout(introTimer);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, visibleStepCount, showTypingIndicator]);

  // Handle send message (UI only — echo back)
  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    // Fake bot response
    setShowTypingIndicator(true);
    setTimeout(() => {
      setShowTypingIndicator(false);
      setMessages(prev => [...prev, {
        id: `bot-${Date.now()}`,
        type: 'bot',
        content: `I understand your question about "${userMsg.content}". This is a UI preview — backend integration is coming soon. For now, please refer to the step cards on the right for detailed instructions.`,
        timestamp: new Date(),
      }]);
    }, 1500);
  };

  // Toggle mic (UI only)
  const toggleMic = () => {
    setIsListening(prev => !prev);
    if (!isListening) {
      // Simulate listening for 3 seconds
      setTimeout(() => {
        setIsListening(false);
        setInputValue('What safety equipment do I need for this step?');
      }, 3000);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Render markdown-like bold text
  const renderContent = (text) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <span key={i} className="font-bold text-white">{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-y-0 left-0 z-[300] flex flex-col"
      style={{
        width: '50vw',
        animation: 'chatbot-slide-in 0.3s ease-out forwards',
      }}
    >
      {/* Solid background — no backdrop-blur to avoid GPU lag */}
      <div className="absolute inset-0 bg-[#0a0a0a]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">SOP Assistant</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Online</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-200 group"
          >
            <span className="material-symbols-outlined text-white/40 text-lg group-hover:text-white/70 transition-colors">close</span>
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin">

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ animation: 'message-pop 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
            >
              {msg.type === 'bot' && (
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 mr-3 mt-1">
                  <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
              )}
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.type === 'user'
                  ? 'bg-primary/20 border border-primary/20 text-white rounded-br-md'
                  : 'bg-white/[0.04] border border-white/[0.06] text-white/70 rounded-bl-md'
              }`}>
                {renderContent(msg.content)}
              </div>
            </div>
          ))}

          {/* Step Cards — pop one by one */}
          {visibleStepCount > 0 && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 mr-3 mt-1">
                <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>list_alt</span>
              </div>
              <div className="flex flex-col gap-2 max-w-[85%]">
                {workflowSteps.slice(0, visibleStepCount).map((step, index) => {
                  const isActive = step.id === currentStepId;
                  const isCompleted = step.id < currentStepId;
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${
                        isActive
                          ? 'bg-primary/10 border-primary/25 shadow-[0_0_12px_rgba(165,200,255,0.1)]'
                          : isCompleted
                            ? 'bg-emerald-500/5 border-emerald-500/15'
                            : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                      style={{
                        animation: `step-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both`,
                      }}
                    >
                      {/* Step number circle */}
                      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${
                        isActive
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : isCompleted
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                            : 'bg-white/[0.04] text-white/30 border border-white/[0.08]'
                      }`}>
                        {isCompleted ? (
                          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                        ) : (
                          step.id
                        )}
                      </div>

                      {/* Step info */}
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold truncate ${
                          isActive ? 'text-primary' : isCompleted ? 'text-emerald-300/80' : 'text-white/50'
                        }`}>
                          {step.title}
                        </p>
                        {step.instructions?.[0] && (
                          <p className="text-[10px] text-white/25 truncate mt-0.5">{step.instructions[0]}</p>
                        )}
                      </div>

                      {/* Status badge */}
                      {isActive && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/20">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Active</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {showTypingIndicator && (
            <div className="flex justify-start" style={{ animation: 'message-pop 0.3s ease forwards' }}>
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 mr-3 mt-1">
                <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <div className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-6 pb-6 pt-2">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-300 ${
            isListening
              ? 'bg-red-500/5 border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
              : 'bg-white/[0.03] border-white/[0.08] focus-within:border-primary/30 focus-within:bg-white/[0.05] focus-within:shadow-[0_0_20px_rgba(165,200,255,0.05)]'
          }`}>
            {/* Mic button */}
            <button
              onClick={toggleMic}
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                isListening
                  ? 'bg-red-500/20 border border-red-500/30 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.2)] animate-pulse'
                  : 'bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.08] hover:border-white/[0.12]'
              }`}
              title={isListening ? 'Stop listening' : 'Start voice input'}
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                {isListening ? 'mic' : 'mic'}
              </span>
            </button>

            {/* Input field */}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? 'Listening...' : 'Ask about any step or procedure...'}
              className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
              disabled={isListening}
            />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                inputValue.trim()
                  ? 'bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 hover:shadow-[0_0_12px_rgba(165,200,255,0.2)]'
                  : 'bg-white/[0.02] border border-white/[0.04] text-white/15 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-lg">arrow_upward</span>
            </button>
          </div>

          {/* Listening waveform */}
          {isListening && (
            <div className="flex items-center justify-center gap-1 mt-3 h-6">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-red-400/60 rounded-full"
                  style={{
                    animation: 'wave-animation 0.8s ease-in-out infinite',
                    animationDelay: `${i * 0.08}s`,
                    height: `${4 + Math.random() * 16}px`,
                  }}
                />
              ))}
            </div>
          )}

          <p className="text-center text-[10px] text-white/15 mt-3 font-mono uppercase tracking-widest">
            SOP Assistant · UI Preview
          </p>
        </div>
      </div>
    </div>
  );
}
