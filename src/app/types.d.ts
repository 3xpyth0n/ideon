import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "a-scene": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        renderer?: string;
        autoResize?: boolean;
        parallax?: boolean;
        shadow?: boolean;
        "ng-plugin"?: boolean;
        "ng-math"?: boolean;
        embedded?: boolean;
        position?: string;
        rotation?: string;
        scale?: string;
      };
      "a-camera": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        "look-controls"?: string;
        "wasd-controls"?: string;
        fov?: number;
        far?: number;
        near?: number;
        position?: string;
        rotation?: string;
        scale?: string;
      };
      "a-entity": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        "gltf-model"?: string;
        "animation-mixer"?: string;
        cursor?: string;
        geometry?: string;
        material?: string;
        position?: string;
        rotation?: string;
        scale?: string;
      };
      "a-box": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        color?: string;
        width?: number;
        height?: number;
        depth?: number;
        position?: string;
        rotation?: string;
        scale?: string;
        shadow?: string;
      };
      "a-sphere": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        color?: string;
        radius?: number;
        position?: string;
        rotation?: string;
        scale?: string;
        shadow?: string;
      };
      "a-cylinder": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        color?: string;
        height?: number;
        radius?: number;
        position?: string;
        rotation?: string;
        scale?: string;
        shadow?: string;
      };
      "a-plane": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        color?: string;
        width?: number;
        height?: number;
        position?: string;
        rotation?: string;
        scale?: string;
        shadow?: string;
        opacity?: number;
        material?: string;
      };
      "a-torus": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        color?: string;
        radius?: number;
        "radius-tubular"?: string;
        position?: string;
        rotation?: string;
        scale?: string;
        shadow?: string;
      };
      "a-cone": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        color?: string;
        height?: number;
        radius?: number;
        position?: string;
        rotation?: string;
        scale?: string;
        shadow?: string;
      };
      "a-text": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLSceneElement>,
        HTMLSceneElement
      > & {
        value?: string;
        color?: string;
        align?: string;
        width?: number;
        position?: string;
        anchor?: string;
        opacity?: number;
        shadow?: string;
        scale?: string;
      };
    }
  }
}

export {};
