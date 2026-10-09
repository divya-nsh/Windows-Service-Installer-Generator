import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function promptConfirm(question: string, defaultValue = false) {
  const hint = defaultValue ? "(Y/n)" : "(y/N)";
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question(`${question} ${hint} `))
        .trim()
        .toLowerCase();
      if (answer === "") return defaultValue;
      if (["y", "yes"].includes(answer)) return true;
      if (["n", "no"].includes(answer)) return false;
      console.log("Please answer y or n.");
    }
  } finally {
    rl.close();
  }
}

export { wait };
