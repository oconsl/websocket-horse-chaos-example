import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  username!: string;
}
