// AudioWorkletProcessor que acumula amostras Float32 do microfone, as
// converte para PCM 16-bit em chunks de ~100ms (1600 amostras a 16kHz) e
// repassa pro Dart via port.postMessage — junto com um VAD (voice activity
// detection) simples client-side, para dar feedback imediato de "parou de
// falar" sem depender de nenhum sinal vindo do servidor/Gemini.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._chunkSize = 1600; // ~100ms @ 16kHz

    // VAD por energia (RMS): abaixo do limiar por alguns chunks seguidos
    // conta como silêncio sustentado (fim de fala).
    this._silenceThreshold = 0.02;
    this._silenceChunksToEnd = 5; // ~500ms de silêncio sustentado
    this._silentChunkCount = 0;
    this._isSpeaking = false;
  }
  process(inputs) {
    const input = inputs[0][0];
    if (input) {
      for (let i = 0; i < input.length; i++) this._buffer.push(input[i]);
      while (this._buffer.length >= this._chunkSize) {
        const chunk = this._buffer.splice(0, this._chunkSize);

        let sumSquares = 0;
        for (let i = 0; i < chunk.length; i++) sumSquares += chunk[i] * chunk[i];
        const rms = Math.sqrt(sumSquares / chunk.length);

        if (rms < this._silenceThreshold) {
          this._silentChunkCount++;
          if (this._isSpeaking && this._silentChunkCount >= this._silenceChunksToEnd) {
            this._isSpeaking = false;
            this.port.postMessage({ vad: 'speech_end' });
          }
        } else {
          this._silentChunkCount = 0;
          if (!this._isSpeaking) {
            this._isSpeaking = true;
            this.port.postMessage({ vad: 'speech_start' });
          }
        }

        const pcm16 = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          const s = Math.max(-1, Math.min(1, chunk[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage({ audio: pcm16.buffer }, [pcm16.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
