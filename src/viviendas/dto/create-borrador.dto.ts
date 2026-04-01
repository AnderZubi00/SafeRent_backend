import { IsString, IsNotEmpty } from 'class-validator';

export class CreateBorradorDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;
}
