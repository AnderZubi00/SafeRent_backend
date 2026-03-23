import { IsString } from 'class-validator';

export class SignContratoDto {
  @IsString({ message: 'La firma en base64 es obligatoria' })
  firma_base64: string;
}
