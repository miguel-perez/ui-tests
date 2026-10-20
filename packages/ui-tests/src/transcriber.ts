/** Turns a spoken answer into text. Optional: an answer given by voice is kept as audio whether or not anything transcribes it. */
export interface Transcriber { transcribe(audio: Uint8Array): Promise<string | undefined> }
/** No transcriber configured: the audio is kept and no text is made from it. */
export const nullTranscriber: Transcriber = { transcribe: async () => undefined }
