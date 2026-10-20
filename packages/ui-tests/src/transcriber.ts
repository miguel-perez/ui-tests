/** Turns a spoken answer into text. Optional: an answer given by voice is kept as audio whether or not anything transcribes it. */
export interface Transcriber { transcribe(audio: Uint8Array): Promise<string | undefined> }
/** No transcriber configured: the audio is kept and no text is made from it. */
export const nullTranscriber: Transcriber = { transcribe: async () => undefined }

/**
 * The transcriber a module names (a package name or an absolute path) whose default export is a `Transcriber`, loaded on first use.
 * `module` is read at each answer, so a server that reads it from the environment sees it as it is then; unset, nothing is transcribed.
 */
export function moduleTranscriber(module: () => string | undefined): Transcriber {
  let loaded: Promise<Transcriber> | undefined
  return {
    async transcribe(audio) {
      const name = module()
      if (!name) return nullTranscriber.transcribe(audio)
      loaded ??= import(/* webpackIgnore: true */ name).then((m: { default: Transcriber }) => m.default)
      return (await loaded).transcribe(audio)
    },
  }
}
