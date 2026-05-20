import { gql } from "@apollo/client";
import { baseResponse } from "./response.graphql";


export const  userProfileData = `
  id
  profileUniqueId
  userFirstName
  userLastName
  userEmail
  profilePhone
  profilePhoto
  profileType
  profileGender
  profileIsActive
`

export const GET_USER_PROFILE = gql`
query GetUserProfile{
  getUserProfile{
    data{
	    ${userProfileData}
    }
    ${baseResponse}
  }
}
`