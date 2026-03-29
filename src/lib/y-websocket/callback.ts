import http from "http";
import { logger } from "../../app/lib/logger";
import {
  Doc,
  Array as YArray,
  Map as YMap,
  Text as YText,
  XmlFragment as YXmlFragment,
  XmlElement as YXmlElement,
} from "yjs";

interface NamedDoc extends Doc {
  name: string;
}

type SharedType =
  | YArray<unknown>
  | YMap<unknown>
  | YText
  | YXmlFragment
  | YXmlElement;

const CALLBACK_URL = process.env.CALLBACK_URL
  ? new URL(process.env.CALLBACK_URL)
  : null;
const CALLBACK_TIMEOUT = process.env.CALLBACK_TIMEOUT
  ? parseInt(process.env.CALLBACK_TIMEOUT)
  : 5000;
const CALLBACK_OBJECTS = process.env.CALLBACK_OBJECTS
  ? JSON.parse(process.env.CALLBACK_OBJECTS)
  : {};

export const isCallbackSet = !!CALLBACK_URL;

interface CallbackData {
  room: string;
  data: Record<string, unknown>;
}

export const callbackHandler = (
  update: Uint8Array,
  origin: unknown,
  doc: NamedDoc,
) => {
  const room = doc.name;
  const dataToSend: CallbackData = {
    room,
    data: {},
  };
  const sharedObjectList = Object.keys(CALLBACK_OBJECTS);
  sharedObjectList.forEach((sharedObjectName) => {
    const sharedObjectType = CALLBACK_OBJECTS[sharedObjectName];
    dataToSend.data[sharedObjectName] = {
      type: sharedObjectType,
      content: getContent(sharedObjectName, sharedObjectType, doc).toJSON(),
    };
  });
  if (CALLBACK_URL) {
    callbackRequest(CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend);
  }
};

const callbackRequest = (url: URL, timeout: number, data: CallbackData) => {
  const stringifiedData = JSON.stringify(data);
  const options: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port ? parseInt(url.port) : undefined,
    path: url.pathname,
    timeout,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": stringifiedData.length,
    },
  };
  const req = http.request(options);
  req.on("timeout", () => {
    logger.warn("[YJS Callback] Callback request timed out.");
    req.destroy();
  });
  req.on("error", (e) => {
    logger.error({ err: e }, "[YJS Callback] Callback request error");
    req.destroy();
  });
  req.write(stringifiedData);
  req.end();
};

const getContent = (objName: string, objType: string, doc: Doc): SharedType => {
  switch (objType) {
    case "Array":
      return doc.getArray(objName);
    case "Map":
      return doc.getMap(objName);
    case "Text":
      return doc.getText(objName);
    case "XmlFragment":
      return doc.getXmlFragment(objName);
    case "XmlElement":
      return doc.getXmlElement(objName);
    default:
      return doc.getMap(objName);
  }
};
