import React from "react";
import { mergeRefs } from "react-merge-refs";
import useMeasure from "react-use-measure";

export const useDralSafearea = () => {
  const map_container_internal_ref = React.useRef<HTMLDivElement>(null);
  const map_safearea_internal_ref = React.useRef<HTMLDivElement>(null);

  const [map_container_measure_ref, map_container_bounds] = useMeasure();
  const [map_safearea_measure_ref, map_safearea_bounds] = useMeasure();

  const map_container_ref = mergeRefs([
    map_container_internal_ref,
    map_container_measure_ref,
  ]);
  const map_safearea_ref = mergeRefs([
    map_safearea_internal_ref,
    map_safearea_measure_ref,
  ]);

  const get_safearea_quickly = () => {
    const map_container = map_container_internal_ref.current;
    const map_safearea = map_safearea_internal_ref.current;
  
    if (!map_container || !map_safearea) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
  
    const map_container_bounds = map_container.getBoundingClientRect();
    const map_safearea_bounds = map_safearea.getBoundingClientRect();
  
    return {
      top: map_safearea_bounds.top - map_container_bounds.top,
      right: -(map_safearea_bounds.right - map_container_bounds.right),
      bottom: -(map_safearea_bounds.bottom - map_container_bounds.bottom),
      left: map_safearea_bounds.left - map_container_bounds.left,
    };
  };  

  const safearea_offsets = {
    top: map_safearea_bounds.top - map_container_bounds.top,
    right: -(map_safearea_bounds.right - map_container_bounds.right),
    bottom: -(map_safearea_bounds.bottom - map_container_bounds.bottom),
    left: map_safearea_bounds.left - map_container_bounds.left,
  };

  return {
    container_ref: map_container_ref,
    safearea_ref: map_safearea_ref,

    ready: map_container_bounds.width > 0 && map_safearea_bounds.width > 0,
    offsets: safearea_offsets,
    get: get_safearea_quickly,
  };
};
