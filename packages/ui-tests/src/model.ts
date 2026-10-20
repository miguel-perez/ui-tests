/** A configured text model that may propose wording. In R0 this is an interface only: template text is what ships. */
export interface TextModel { complete(prompt: string): Promise<string> }
/** No model configured: every derived text takes its template path. */
export const nullModel: TextModel | undefined = undefined
