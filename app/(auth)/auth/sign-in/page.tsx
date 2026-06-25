import SignInFormClient from '@/modules/auth/components/sign-in-form-client'
import Image from 'next/image'
import React from 'react'

const Page = () => {
  return (
    <>
    {/* <Image src={"/login.svg"} alt='Login-Image' width={300} height={300} className="mb-6 object-cover" /> */}
    <SignInFormClient />
    </>
  )
}

export default Page