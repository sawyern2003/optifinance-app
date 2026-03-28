import { useState, useCallback, useRef, useEffect } from 'react';
import { getVoicePlayer } from '@/lib/audioPlayer';

/**
 * Hook for ElevenLabs Text-to-Speech
 * Manages voice playback state and progress tracking
 */
export function useElevenLabs() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const playerRef = useRef(null);

  // Initialize player
  useEffect(() => {
    if (!playerRef.current) {
      playerRef.current = getVoicePlayer();
    }

    return () => {
      // Clean up on unmount
      if (playerRef.current) {
        playerRef.current.stop();
      }
    };
  }, []);

  /**
   * Speak text using ElevenLabs TTS
   */
  const speak = useCallback(async (text, voiceId) => {
    if (!text) {
      console.warn('No text provided to speak');
      return;
    }

    try {
      setIsSpeaking(true);
      setError(null);
      setProgress(0);

      const player = playerRef.current;
      if (!player) {
        throw new Error('Voice player not initialized');
      }

      await player.speak(
        text,
        voiceId,
        // Progress callback
        (p) => setProgress(p),
        // Complete callback
        () => {
          setIsSpeaking(false);
          setProgress(1);
        }
      );
    } catch (err) {
      console.error('TTS error:', err);
      setError(err.message || 'Failed to generate speech');
      setIsSpeaking(false);
      setProgress(0);
    }
  }, []);

  /**
   * Stop current speech
   */
  const stop = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
      setIsSpeaking(false);
      setProgress(0);
    }
  }, []);

  /**
   * Pause current speech
   */
  const pause = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.pause();
      setIsSpeaking(false);
    }
  }, []);

  /**
   * Get current playback state
   */
  const getState = useCallback(() => {
    if (playerRef.current) {
      return playerRef.current.getPlaybackState();
    }
    return { isPlaying: false, duration: 0, currentTime: 0 };
  }, []);

  return {
    speak,
    stop,
    pause,
    getState,
    isSpeaking,
    progress,
    error,
  };
}
