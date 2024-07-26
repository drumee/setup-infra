_ = require("lodash");
Shell = require("shelljs");
const { mkdirSync, existsSync, writeSync, openSync, close, readFileSync } = require("fs");
const { env } = process;
const { resolve, join, dirname } = require("path");
const ARGV = require('minimist')(process.argv.slice(2));

/**
 * 
 * @param {*} p 
 * @returns 
 */
function chroot(p) {
  let root = ARGV.chroot || env.dev_root;
  if (root) {
    if (p) return join(root, p);
    return join(root);
  }
  if (p) return join("/", p);
  return ('/');
}

/**
 * 
 */
function makedir(dname) {
  if (!existsSync(dname)) {
    //console.log(`Should make dir ${dname}`);
    mkdirSync(dname, { recursive: true });
  }
};



/**
 * 
 * @param {*} err 
 */
function __error(err) {
  if (err) throw err;
};


/**
 * 
 */
function render(data, name, parse) {
  let tpl = resolve(__dirname, "templates", name + ".tpl");
  if (/\/templates$/.test(__dirname))
    tpl = resolve(__dirname, name + ".tpl");
  if (!existsSync(tpl)) {
    tpl = resolve(__dirname, name);
  }
  //console.log("RENDERING", __dirname, name, tpl);
  let str = readFileSync(tpl);
  try {
    let res = _.template(String(str).toString())(data);
    if (parse && typeof res === "string") {
      return JSON.parse(res);
    }
    return res;
  } catch (e) {
    console.error(`Failed to render from template ${tpl}`);
    console.error("------------\n", e);
  }
};

/**
 *
 * @param {*} data
 * @param {*} fn
 * @param {*} tpl_name
 * @param {*} chr
 * @returns
 */
function write(data, fn, tpl_name, chr) {
  let filename = chroot(fn);
  makedir(dirname(filename));
  let d = new Date();
  data.date = d.toISOString().split('T')[0];

  console.log("Writing config into " + filename);
  let fd = openSync(filename, "w+");
  if (ARGV.readonly) {
    console.log("Readonly", fn, tpl_name);
    return
  }

  if (_.isEmpty(tpl_name)) {
    writeSync(fd, data);
  } else {
    writeSync(fd, render(data, tpl_name));
  }
  close(fd, __error);
}


module.exports = {
  write,
  chroot,
  render
};
