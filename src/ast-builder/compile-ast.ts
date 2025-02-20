import fs from "fs";
import { execSync } from "child_process";
import { Config } from "../config";
import { getAstsFromSources, getContractsList } from "./getters";
import { basename, join, extname, resolve } from "path";

const createDirectoryIfNotExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
};

const moveFiles = (sourceDir: string, destinationDir: string) => {
  let files = fs.readdirSync(sourceDir);
  files.forEach((file) => {
    let oldPath = join(sourceDir, file);
    let newPath = join(destinationDir, file);
    fs.renameSync(oldPath, newPath);
  });
};

const deleteDirectoryIfExists = (dir: string) => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
};

/**
 * It takes the config object, gets a list of contracts, and then compiles the AST for each contract
 * @param {Config} config - The configuration object that we created earlier.
 */
export const compileAst = async (config: Config) => {
  const contracts = getContractsList(config.sourcesDir!, config.exclude!);

  let astOutputPath = resolve(config.root!, config.astOutputDir!);
  deleteDirectoryIfExists(astOutputPath);

  let astCachePath = resolve(config.root!, `ast-cache`);
  let astPath = resolve(config.root!, "ast");

  createDirectoryIfNotExists(astCachePath);
  createDirectoryIfNotExists(astPath);
  const nodeModules =
    config.sourcesDir != "contracts"
      ? `--base-path ${config.sourcesDir?.replace(
          "/contracts",
          ""
        )} -i ${config.sourcesDir?.replace("/contracts", "/node_modules")}`
      : "";
  contracts.forEach((contract) => {
    execSync(
      `${config.compilerPath} --ast-compact-json ${config.sourcesDir}/${contract} --output-dir=${astCachePath} ${nodeModules}`
    );
    moveFiles(astCachePath, astOutputPath);
  });

  deleteDirectoryIfExists(astCachePath);
  compileExternalAst(config);
  renameAstFiles(astOutputPath);
  wrapAstInArray(astOutputPath);
};

/**
 * It compiles all the external sources in the project, and saves the ASTs in the `astOutputDir`
 * directory
 * @param {Config} config - Config
 */
export const compileExternalAst = async (config: Config) => {
  const { fullSources } = getAstsFromSources(
    config.astOutputDir!,
    config.root!,
    config.sourcesDir!
  );

  let astCachePath = resolve(config.root!, `ast-cache`);
  let astPath = resolve(config.root!, "ast");

  createDirectoryIfNotExists(astCachePath);
  createDirectoryIfNotExists(astPath);
  const nodeModules =
    config.sourcesDir != "contracts"
      ? `--base-path ${config.sourcesDir?.replace(
          "/contracts",
          ""
        )} -i ${config.sourcesDir?.replace("contracts", "node_modules")}`
      : "";
  Object.values(fullSources).forEach((source) => {
    for (const ast of source.asts) {
      const absolutePath = ast.absolutePath;
      if (!absolutePath.startsWith(config.sourcesDir!)) {
        execSync(
          `${config.compilerPath} --ast-compact-json $PWD/${config.sourcesDir}/${absolutePath} --output-dir=${astCachePath} ${nodeModules}`
        );
      }
    }
    moveFiles(astCachePath, astPath);
  });

  deleteDirectoryIfExists(astCachePath);
};

const renameAstFiles = (dir: string) => {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    if (file.endsWith(".sol_json.ast")) {
      const oldPath = join(dir, file);
      const newFileName = basename(file, ".sol_json.ast") + ".ast.json";
      const newPath = join(dir, newFileName);
      fs.renameSync(oldPath, newPath);
    } else if (file.endsWith(".tsol_json.ast")) {
      const oldPath = join(dir, file);
      const newFileName = basename(file, ".tsol_json.ast") + ".ast.json";
      const newPath = join(dir, newFileName);
      fs.renameSync(oldPath, newPath);
    }
  });
};

const wrapAstInArray = (dir: string) => {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    if (extname(file) === ".json") {
      const filePath = join(dir, file);
      const content = fs.readFileSync(filePath, "utf8");
      let jsonContent;

      try {
        jsonContent = JSON.parse(content);
      } catch (error) {
        console.error(`Error parsing file ${file}:`, error);
        return;
      }

      if (!Array.isArray(jsonContent)) {
        const wrappedContent = [jsonContent];
        fs.writeFileSync(filePath, JSON.stringify(wrappedContent, null, 2));
      }
    }
  });
};
