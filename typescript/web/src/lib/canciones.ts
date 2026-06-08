/**
 * Biblioteca musical — canciones disponibles para el DJ Agent.
 */

export interface Cancion {
  titulo: string;
  artista: string;
  genero: string;
  mood: string;
  energia: number;
  duracion_min: number;
}

import { readFileSync } from "fs";
import { resolve } from "path";

const dataPath = resolve(process.cwd(), "..", "data", "canciones.json");
export const BIBLIOTECA: Cancion[] = JSON.parse(readFileSync(dataPath, "utf-8"));
