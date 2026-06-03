import React from "react";

export interface RouteInterface {
  path: string;
  element: React.ReactNode;
  children?: RouteInterface[];
}

export interface NavLinksInterface {
  to: string;
  name: string;
  icon: React.ReactElement;
}

export interface cardLayoutProps {
  name: String;
  to: string;
  icon?: React.ReactElement;
}

export interface SideNavInterface {
  title: String;
  to: string;
  icon: React.ReactElement;
}

export interface DataTableColumns {
  id: string;
  label: string;
  minWidth?: number;
  align?: "right" | "left";
  format?: (value: any) => any;
  sortable?: boolean;
}

export interface DataTableActions {
  title: string;
  icon: React.ReactElement;
  calBackFunction: (x?: any) => void | any;
}

export interface BaseDynamicInterface {
  key: string;
  label: string;
  required?: boolean;
  size?: FieldSize;
  validations?: FieldEros[];
}

export enum FieldSize {
  small = "w-[98%] lg:w-[31.4%]",
  medium = "w-[98%] lg:w-[48%]",
  large = "w-[98%] lg:w-[98%]",
}

export interface FieldEros {
  name: "required" | "email" | "maxLength" | "minLength";
  message: String;
  minLength?: number;
  maxLength?: number;
}

export interface ValidationResultsInterface {
  key: string;
  hasErrors: boolean;
}
