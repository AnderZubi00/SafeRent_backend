/*
  Warnings:

  - Added the required column `contrasena_hash` to the `usuarios` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "contrasena_hash" TEXT NOT NULL;
