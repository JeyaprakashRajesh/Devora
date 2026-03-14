package utils

import "golang.org/x/crypto/bcrypt"

func HashPassword(plain string) (string, error) {
  bytes, err := bcrypt.GenerateFromPassword([]byte(plain), 12)
  return string(bytes), err
}

func CheckPassword(plain, hash string) bool {
  return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
