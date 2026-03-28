/**
 * Voice Audio Player using Web Audio API
 * Handles ElevenLabs TTS audio playback with progress tracking
 */

export class VoicePlayer {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private startTime: number = 0;
  private pausedAt: number = 0;
  private duration: number = 0;
  private isPlaying: boolean = false;
  private onProgressCallback: ((progress: number) => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;
  private progressInterval: number | null = null;

  constructor() {
    // Initialize AudioContext lazily (requires user interaction)
    if (typeof window !== 'undefined') {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        this.audioContext = new AC();
      }
    }
  }

  /**
   * Speak text using ElevenLabs TTS
   */
  async speak(
    text: string,
    voiceId?: string,
    onProgress?: (progress: number) => void,
    onComplete?: () => void
  ): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not available');
    }

    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.onProgressCallback = onProgress || null;
    this.onCompleteCallback = onComplete || null;

    try {
      // Fetch audio from edge function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/text-to-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ text, voiceId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `TTS API error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Play the audio
      this.playBuffer(audioBuffer);
    } catch (error) {
      console.error('Speech synthesis error:', error);
      throw error;
    }
  }

  /**
   * Play an audio buffer
   */
  private playBuffer(audioBuffer: AudioBuffer): void {
    if (!this.audioContext) return;

    // Stop any currently playing audio
    this.stop();

    // Create and configure source
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.audioContext.destination);

    this.duration = audioBuffer.duration;
    this.startTime = this.audioContext.currentTime - this.pausedAt;
    this.pausedAt = 0;
    this.isPlaying = true;

    // Handle playback end
    this.currentSource.onended = () => {
      this.isPlaying = false;
      this.clearProgressInterval();
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
    };

    // Start playback
    this.currentSource.start(0);

    // Start progress tracking
    this.startProgressTracking();
  }

  /**
   * Start tracking playback progress
   */
  private startProgressTracking(): void {
    this.clearProgressInterval();

    this.progressInterval = window.setInterval(() => {
      if (this.isPlaying && this.audioContext && this.onProgressCallback) {
        const elapsed = this.audioContext.currentTime - this.startTime;
        const progress = Math.min(elapsed / this.duration, 1);
        this.onProgressCallback(progress);
      }
    }, 50); // Update every 50ms
  }

  /**
   * Clear progress tracking interval
   */
  private clearProgressInterval(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.currentSource.disconnect();
      this.currentSource = null;
    }

    this.isPlaying = false;
    this.pausedAt = 0;
    this.clearProgressInterval();
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.isPlaying && this.audioContext) {
      this.pausedAt = this.audioContext.currentTime - this.startTime;
      this.stop();
    }
  }

  /**
   * Get current playback state
   */
  getPlaybackState(): {
    isPlaying: boolean;
    duration: number;
    currentTime: number;
  } {
    let currentTime = 0;
    if (this.isPlaying && this.audioContext) {
      currentTime = this.audioContext.currentTime - this.startTime;
    } else if (this.pausedAt > 0) {
      currentTime = this.pausedAt;
    }

    return {
      isPlaying: this.isPlaying,
      duration: this.duration,
      currentTime: Math.min(currentTime, this.duration),
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.clearProgressInterval();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Global singleton instance
let globalVoicePlayer: VoicePlayer | null = null;

export function getVoicePlayer(): VoicePlayer {
  if (!globalVoicePlayer) {
    globalVoicePlayer = new VoicePlayer();
  }
  return globalVoicePlayer;
}
