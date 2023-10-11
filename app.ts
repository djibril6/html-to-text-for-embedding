import "dotenv/config";
const Parser = require("@postlight/parser");
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ChatPromptTemplate } from "langchain/prompts";
import { MarkdownTextSplitter } from "langchain/text_splitter";

/**
 * Extract a web page content
 */
class HTMLParserForEmbedding {
  private splitted = [] as string[];
  private chatModel = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-3.5-turbo-16k",
    temperature: 0,
  });
  private chunkSize = 0;
  private url = "";

  constructor(url: string, chunkSize?: number) {
    this.chunkSize = chunkSize || 10000;
    this.url = url;
  }

  /**
   *
   * @param url the url or the page
   * @returns chunked list
   */
  loadContent() {
    return new Promise<string[]>((resolve, reject) => {
      // Converting the html into markdown instead of text to not loose some contexts provided by the html tags
      Parser.parse(this.url, {
        contentType: "markdown",
      }).then(async (res: any) => {
        const textSplitter = new MarkdownTextSplitter({
          chunkSize: this.chunkSize,
          chunkOverlap: 0,
        });
        textSplitter.splitText(res.content).then((split) => {
          this.splitted = split;
          resolve(split);
        });
      });
    });
  }

  async contextBasedSplit() {
    if (!this.splitted.length) {
      throw new Error("You should call loadContent first to load the url");
    }

    const template =
      'You are a helpful text analyser that first replace any double quote " found in a text with a simple quote then split the text into chunks following this JSON format: [{{"topic": "the topic 1", "text": "the original text source"}}].';
    const humanTemplate = "{text}";

    const chatPrompt = ChatPromptTemplate.fromMessages([
      ["system", template],
      ["human", humanTemplate],
    ]);

    const createCompletion = async (split: string) => {
      const chain = chatPrompt.pipe(this.chatModel);

      const completion = await chain.invoke({
        text: split,
      });
      return completion.content;
    };

    const result = await Promise.all(this.splitted.map(createCompletion));

    const output = [] as any[];
    result.forEach((re) => {
      try {
        output.push(...JSON.parse(re));
      } catch (error) {}
    });

    return output;
  }
}

// Here is an Example of use
const url = "https://en.wikipedia.org/wiki/Artificial_intelligence";

const url2 =
  "https://www.forbes.com/sites/ashleystahl/2021/03/10/how-ai-will-impact-the-future-of-work-and-life/?sh=255c08479a30";

const htmlParser = new HTMLParserForEmbedding(url2);
htmlParser.loadContent().then((splitted) => {
  // this return the text splitted by character while avoiding to separate
  // a portion of text from his header
  // This can be enough for embedding but I wanted to provide more robust embedding
  console.log(splitted);

  // contextBaseSplit will split the text into chunk based on their context
  // This way each embedding will be related to a specific topic within the text
  // This is supposed to be more accurate but slow because it use openAI to split the text
  htmlParser.contextBasedSplit().then((chunks) => {
    console.log(chunks);
  });
});
