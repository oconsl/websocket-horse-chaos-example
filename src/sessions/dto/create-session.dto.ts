import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}
