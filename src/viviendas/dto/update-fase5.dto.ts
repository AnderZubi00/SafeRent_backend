import { IsOptional, IsString } from 'class-validator';

export class UpdateFase5Dto {
  @IsOptional()
  @IsString()
  nota_simple_url?: string;
}
